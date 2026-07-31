import { Prisma, type TransferOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { transferPrice, nettedLedger } from "@/lib/transfer";
import { checkPMin } from "@/lib/sales";
import { minViablePrice } from "@/lib/finance";
import { suggestDiscount } from "@/lib/sales";
import { loadDiscountRules } from "./discount-service";
import { getDecisionFloor } from "./costing-service";
import { fifoAvgUnitCost, fifoIssue, stockIn } from "./inventory-service";
import type { TransferCreateInput, SettlementInput } from "@/lib/validators/transfer";

/**
 * Inter-entity transfers (spec v2 §5.2). A transfer is an internal sale: the
 * transferPrice (base − sealed discount) is where the publishing entity's profit
 * ends and the distribution entity's begins. On RECEIVE the goods leave the
 * sender (FIFO OUT) and enter the receiver at a NEW cost basis = transferPrice.
 * The P_min floor (decisionCost, else P_min/FIFO) applies to internal trade too.
 */

export class TransferServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferServiceError";
  }
}

export class TransferPMinError extends Error {
  constructor(
    message: string,
    public readonly details: { productId: string; floor: string; transferPrice: string }[],
  ) {
    super(message);
    this.name = "TransferPMinError";
  }
}

export const TRANSFER_FLOW: Record<TransferOrderStatus, TransferOrderStatus[]> = {
  DRAFT: ["SHIPPED"],
  SHIPPED: ["RECEIVED"],
  RECEIVED: [],
};

function canTransition(from: TransferOrderStatus, to: TransferOrderStatus): boolean {
  return TRANSFER_FLOW[from]?.includes(to) ?? false;
}

/** The floor a transferPrice must clear: decisionCost (M12) else P_min over FIFO. */
async function priceFloor(productId: string): Promise<Prisma.Decimal> {
  const decision = await getDecisionFloor(productId);
  if (decision && decision.gt(0)) return decision;
  const unitCost = await fifoAvgUnitCost(productId);
  return unitCost.gt(0) ? minViablePrice({ uc: unitCost, discountRate: 0, royaltyRate: 0 }) : new Prisma.Decimal(0);
}

/**
 * Create a DRAFT transfer. The discount is resolved (suggestDiscount or manual)
 * and the transferPrice SEALED per line. A transferPrice below the floor is a
 * hard block unless an admin overrides it (audited).
 */
export async function createTransfer(input: TransferCreateInput, userId: string) {
  const rules = await loadDiscountRules();
  const resolved: {
    productId: string;
    qty: number;
    basePrice: Prisma.Decimal;
    discountRate: Prisma.Decimal;
    source: string;
    transferPrice: Prisma.Decimal;
    floor: Prisma.Decimal;
    belowFloor: boolean;
  }[] = [];

  for (const l of input.lines) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: l.productId },
      select: { id: true, titleId: true, listPrice: true },
    });
    const basePrice = new Prisma.Decimal(l.basePrice ?? product.listPrice);

    let discountRate: Prisma.Decimal;
    let source: string;
    if (l.discountRate != null) {
      discountRate = new Prisma.Decimal(l.discountRate);
      source = "MANUAL";
    } else {
      const s = suggestDiscount(rules, {
        titleId: product.titleId,
        entityId: input.toEntityId,
        qty: l.qty,
      });
      discountRate = new Prisma.Decimal(s.rate.toString());
      source = s.source;
    }

    const tp = new Prisma.Decimal(transferPrice(basePrice, discountRate).toFixed(2));
    const floor = await priceFloor(product.id);
    const pm = checkPMin({ unitPrice: tp, discountRate: 0, unitCost: floor, royaltyRate: 0 });
    resolved.push({
      productId: product.id,
      qty: l.qty,
      basePrice,
      discountRate,
      source,
      transferPrice: tp,
      floor,
      belowFloor: floor.gt(0) && pm.violated,
    });
  }

  const violations = resolved.filter((r) => r.belowFloor);
  if (violations.length > 0 && !input.overridePMin) {
    throw new TransferPMinError(
      `P_min buzilgan (${violations.length} qator) — transfer narxi polni qoplamaydi`,
      violations.map((v) => ({ productId: v.productId, floor: v.floor.toFixed(0), transferPrice: v.transferPrice.toFixed(0) })),
    );
  }

  return runWithAudit({ userId }, async () => {
    const order = await prisma.transferOrder.create({
      data: {
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        status: "DRAFT",
        lines: {
          create: resolved.map((r) => ({
            productId: r.productId,
            qty: r.qty,
            basePrice: r.basePrice,
            discountRate: r.discountRate, // SEALED
            transferPrice: r.transferPrice, // SEALED
          })),
        },
      },
      include: { lines: true },
    });
    if (violations.length > 0) {
      await prisma.notification.create({
        data: {
          type: "GENERAL",
          severity: "WARNING",
          title: "Transfer P_min override",
          body: `Transfer ${order.id}: ${violations.length} qatorda narx poldan past, admin override bilan saqlandi`,
          linkUrl: "/transfers",
          refType: "TransferOrder",
          refId: order.id,
          targetRole: "DIRECTOR",
        },
      });
    }
    // Warehouses are validated at receive time (need product-in-stock there).
    return { order, lines: resolved };
  });
}

export async function shipTransfer(orderId: string, userId: string) {
  const order = await prisma.transferOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!canTransition(order.status, "SHIPPED")) {
    throw new TransferServiceError(`Holat oʻtishi taqiqlangan: ${order.status} → SHIPPED`);
  }
  return runWithAudit({ userId }, async () =>
    prisma.transferOrder.update({ where: { id: orderId }, data: { status: "SHIPPED", shippedDate: new Date() } }),
  );
}

/**
 * RECEIVE: goods leave the sender warehouse (FIFO OUT) and enter the receiver
 * warehouse as a NEW FIFO layer priced at transferPrice — the receiving entity's
 * cost basis. This is the internal-sale boundary.
 */
export async function receiveTransfer(
  orderId: string,
  warehouses: { fromWarehouseId: string; toWarehouseId: string },
  userId: string,
) {
  const order = await prisma.transferOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true },
  });
  if (!canTransition(order.status, "RECEIVED")) {
    throw new TransferServiceError(`Holat oʻtishi taqiqlangan: ${order.status} → RECEIVED`);
  }

  // T-03: Verify warehouses are owned by the correct entities.
  const [fromWh, toWh] = await Promise.all([
    prisma.warehouse.findUniqueOrThrow({ where: { id: warehouses.fromWarehouseId }, select: { entityId: true } }),
    prisma.warehouse.findUniqueOrThrow({ where: { id: warehouses.toWarehouseId }, select: { entityId: true } }),
  ]);
  if (fromWh.entityId !== order.fromEntityId) {
    throw new TransferServiceError("Manba ombor transfer yuborguvchi sub'ektga tegishli emas");
  }
  if (toWh.entityId !== order.toEntityId) {
    throw new TransferServiceError("Manzil ombor transfer qabul qiluvchi sub'ektga tegishli emas");
  }

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      for (const l of order.lines) {
        // Sender: FIFO TRANSFER (cost basis leaves; type=TRANSFER keeps it out of salesSeries/Sotilgan).
        await fifoIssue(tx, {
          productId: l.productId,
          warehouseId: warehouses.fromWarehouseId,
          qty: l.qty,
          type: "TRANSFER",
          refType: "TransferOrder",
          refId: order.id,
        });
        // Receiver: new IN layer at the transferPrice (new cost basis).
        await stockIn(tx, {
          productId: l.productId,
          warehouseId: warehouses.toWarehouseId,
          qty: l.qty,
          unitCostUZS: new Prisma.Decimal(l.transferPrice),
          refType: "TransferOrder",
          refId: order.id,
        });
      }
      return tx.transferOrder.update({
        where: { id: orderId },
        data: { status: "RECEIVED", receivedDate: new Date() },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  );
}

// ── Inter-entity ledger ────────────────────────────────────────────────────────

/** Net balances per entity pair: received transfers − settlements. */
export async function entityLedger() {
  const [orders, settlements, entities] = await Promise.all([
    prisma.transferOrder.findMany({
      where: { status: "RECEIVED" },
      include: { lines: true },
    }),
    prisma.entitySettlement.findMany(),
    prisma.entity.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = new Map(entities.map((e) => [e.id, e.name]));

  const transfers = orders.map((o) => ({
    fromEntityId: o.fromEntityId,
    toEntityId: o.toEntityId,
    amount: o.lines.reduce((a, l) => a.plus(new Prisma.Decimal(l.transferPrice).times(l.qty)), new Prisma.Decimal(0)),
  }));

  const balances = nettedLedger(
    transfers.map((t) => ({ ...t, amount: t.amount.toString() })),
    settlements.map((s) => ({ fromEntityId: s.fromEntityId, toEntityId: s.toEntityId, amount: new Prisma.Decimal(s.amountUZS).toString() })),
  );

  return balances.map((b) => ({
    creditorId: b.creditorId,
    creditorName: nameById.get(b.creditorId) ?? b.creditorId,
    debtorId: b.debtorId,
    debtorName: nameById.get(b.debtorId) ?? b.debtorId,
    amount: b.amount,
  }));
}

export async function recordSettlement(input: SettlementInput, userId: string) {
  return runWithAudit({ userId }, async () =>
    prisma.entitySettlement.create({
      data: {
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        amountUZS: new Prisma.Decimal(input.amountUZS),
        note: input.note ?? null,
      },
    }),
  );
}

export async function listTransfers(take = 200, entityIds?: string[]) {
  return prisma.transferOrder.findMany({
    where:
      entityIds && entityIds.length > 0
        ? { OR: [{ fromEntityId: { in: entityIds } }, { toEntityId: { in: entityIds } }] }
        : undefined,
    include: {
      fromEntity: { select: { name: true } },
      toEntity: { select: { name: true } },
      lines: { include: { product: { select: { sku: true, title: { select: { workTitle: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
