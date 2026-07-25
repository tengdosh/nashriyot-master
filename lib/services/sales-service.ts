import { Prisma, type SalesOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { checkCreditLimit, checkPMin, lineEconomics, orderTotals, type LineInput } from "@/lib/sales";
import { fifoAvgUnitCost, fifoIssue } from "./inventory-service";
import { suggestDiscount } from "@/lib/sales";
import { loadDiscountRules } from "./discount-service";
import type { SalesOrderCreateInput } from "@/lib/validators/sales";

/** Status machine (spec v1 §5.5). CANCELLED is reachable until the goods ship. */
export const SALES_FLOW: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["INVOICED"],
  INVOICED: ["PAID"],
  PAID: [],
  CANCELLED: [],
};

export class SalesOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesOrderError";
  }
}

/** P_min breach — a hard red block unless an admin overrides it (audited). */
export class PMinViolationError extends Error {
  constructor(
    message: string,
    public readonly details: { productId: string; pMin: string; unitPrice: string }[],
  ) {
    super(message);
    this.name = "PMinViolationError";
  }
}

export class CreditLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditLimitError";
  }
}

export function canSalesTransition(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return SALES_FLOW[from]?.includes(to) ?? false;
}

/**
 * Royalty per unit for CM purposes — v2 §6: an estimate exists ONLY for a
 * ROYALTY contract. A BUYOUT title's author cost is already a title-unique cost
 * (M3/M7), so charging it again per copy would double-count it.
 */
async function royaltyEstimateUnit(
  titleId: string,
  format: string,
  listPrice: Prisma.Decimal,
  netUnit: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const contract = await prisma.contract.findFirst({
    where: { titleId, type: "ROYALTY", status: "ACTIVE", archivedAt: null },
    include: { tiers: { orderBy: { fromUnits: "asc" } } },
  });
  if (!contract) return new Prisma.Decimal(0);

  const tier =
    contract.tiers.find((t) => t.format === format) ?? contract.tiers.find((t) => t.format === null);
  if (!tier) return new Prisma.Decimal(0);

  const base = tier.basis === "LIST" ? listPrice : netUnit;
  return base.times(tier.rate);
}

type ResolvedLine = {
  productId: string;
  titleId: string;
  format: string;
  qty: number;
  unitPrice: Prisma.Decimal;
  discountRate: Prisma.Decimal;
  discountSource: string;
  deliveryCostUnit: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  pMin: Prisma.Decimal;
  pMinViolated: boolean;
};

/**
 * Resolve each line's price and discount and run the P_min floor. Prices default
 * to the product list price and discounts to `suggestDiscount`, but whatever is
 * resolved here is what gets SEALED on the line — the rule can change tomorrow
 * without moving this document.
 */
async function resolveLines(
  input: SalesOrderCreateInput,
  channel: { defaultDiscount: Prisma.Decimal },
): Promise<ResolvedLine[]> {
  const rules = await loadDiscountRules();
  const out: ResolvedLine[] = [];

  for (const l of input.lines) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: l.productId },
      select: { id: true, titleId: true, format: true, listPrice: true },
    });
    const unitPrice = new Prisma.Decimal(l.unitPrice ?? product.listPrice);

    let discountRate: Prisma.Decimal;
    let discountSource: string;
    if (l.discountRate != null) {
      discountRate = new Prisma.Decimal(l.discountRate);
      discountSource = "MANUAL";
    } else {
      const s = suggestDiscount(rules, {
        partnerId: input.partnerId ?? null,
        titleId: product.titleId,
        entityId: input.entityId,
        qty: l.qty,
      });
      // No rule matched at all → fall back to the channel's default discount.
      if (s.source === "NONE") {
        discountRate = new Prisma.Decimal(channel.defaultDiscount);
        discountSource = "CHANNEL";
      } else {
        discountRate = new Prisma.Decimal(s.rate.toString());
        discountSource = s.source;
      }
    }

    const unitCost = await fifoAvgUnitCost(l.productId, input.warehouseId);
    const netUnit = unitPrice.times(new Prisma.Decimal(1).minus(discountRate));
    const royaltyRate = (await royaltyEstimateUnit(product.titleId, product.format, unitPrice, netUnit))
      .div(unitPrice.gt(0) ? unitPrice : 1);

    const pm = checkPMin({
      unitPrice,
      discountRate,
      unitCost,
      royaltyRate,
    });

    out.push({
      productId: product.id,
      titleId: product.titleId,
      format: product.format,
      qty: l.qty,
      unitPrice,
      discountRate,
      discountSource,
      deliveryCostUnit: new Prisma.Decimal(l.deliveryCostUnit ?? 0),
      unitCost,
      pMin: new Prisma.Decimal(pm.pMin.isFinite() ? pm.pMin.toFixed(2) : 0),
      // A zero-cost SKU (nothing received yet) has no meaningful floor.
      pMinViolated: pm.violated && unitCost.gt(0),
    });
  }
  return out;
}

/**
 * Create a DRAFT order. Nothing is reserved and no stock moves yet — that starts
 * at CONFIRMED. The discount is sealed on each line here.
 */
export async function createSalesOrder(input: SalesOrderCreateInput, userId: string) {
  const channel = await prisma.salesChannel.findUniqueOrThrow({ where: { id: input.channelId } });
  const lines = await resolveLines(input, channel);

  const violations = lines.filter((l) => l.pMinViolated);
  if (violations.length > 0 && !input.overridePMin) {
    throw new PMinViolationError(
      `P_min buzilgan (${violations.length} qator) — narx tannarxni qoplamaydi`,
      violations.map((v) => ({
        productId: v.productId,
        pMin: v.pMin.toFixed(0),
        unitPrice: v.unitPrice.toFixed(0),
      })),
    );
  }

  return runWithAudit({ userId }, async () => {
    const order = await prisma.salesOrder.create({
      data: {
        channelId: input.channelId,
        entityId: input.entityId,
        warehouseId: input.warehouseId,
        partnerId: input.partnerId ?? null,
        customerName: input.customerName ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        deliveryProvider: input.deliveryProvider ?? null,
        status: "DRAFT",
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            discountRate: l.discountRate, // SEALED
            deliveryCostUnit: l.deliveryCostUnit,
          })),
        },
      },
      include: { lines: true },
    });

    // An override is never silent — it lands in the audit trail as its own event.
    if (violations.length > 0) {
      await prisma.notification.create({
        data: {
          type: "GENERAL",
          severity: "WARNING",
          title: "P_min override qoʻllanildi",
          body: `Buyurtma ${order.id}: ${violations.length} qatorda narx P_min dan past, admin override bilan saqlandi`,
          linkUrl: `/sales/orders/${order.id}`,
          refType: "SalesOrder",
          refId: order.id,
          targetRole: "DIRECTOR",
        },
      });
    }

    return { order, lines };
  });
}

/** Open (unpaid) AR for a partner — the base for the credit-limit check. */
export async function outstandingForPartner(partnerId: string): Promise<Prisma.Decimal> {
  const rows = await prisma.receivable.findMany({
    where: { partnerId, status: { in: ["OPEN", "PARTIAL"] } },
    select: { amountUZS: true, paidUZS: true },
  });
  return rows.reduce(
    (a, r) => a.plus(new Prisma.Decimal(r.amountUZS).minus(r.paidUZS)),
    new Prisma.Decimal(0),
  );
}

function toLineInputs(
  lines: { qty: number; unitPrice: Prisma.Decimal; discountRate: Prisma.Decimal; cogsUnit: Prisma.Decimal | null; deliveryCostUnit: Prisma.Decimal | null }[],
  feeRate: Prisma.Decimal,
): LineInput[] {
  return lines.map((l) => ({
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountRate: l.discountRate,
    channelFeeRate: feeRate,
    cogsUnit: l.cogsUnit,
    deliveryCostUnit: l.deliveryCostUnit ?? 0,
  }));
}

/**
 * CONFIRMED: check the partner's credit limit against open AR, then reserve the
 * stock. Reservation is what stops two salespeople selling the same copies.
 */
export async function confirmSalesOrder(orderId: string, userId: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, channel: true, partner: true },
  });
  if (!canSalesTransition(order.status, "CONFIRMED")) {
    throw new SalesOrderError(`Holat oʻtishi taqiqlangan: ${order.status} → CONFIRMED`);
  }

  const totals = orderTotals(toLineInputs(order.lines, new Prisma.Decimal(order.channel.feeRate)));

  if (order.partner) {
    const outstanding = await outstandingForPartner(order.partner.id);
    const credit = checkCreditLimit({
      creditLimit: order.partner.creditLimit ? new Prisma.Decimal(order.partner.creditLimit) : null,
      outstandingUZS: outstanding,
      orderValueUZS: totals.net,
      isBlocked: order.partner.isBlocked,
    });
    if (credit.exceeded) {
      await prisma.notification.create({
        data: {
          type: "CREDIT_LIMIT",
          severity: "CRITICAL",
          title: "Kredit limiti oshib ketdi",
          body: `${order.partner.name}: ochiq qarz ${outstanding.toFixed(0)} soʻm, yangi buyurtma ${totals.net.toFixed(0)} soʻm${credit.limit ? `, limit ${credit.limit.toFixed(0)} soʻm` : " (bloklangan hamkor)"}`,
          linkUrl: "/sales/receivables",
          refType: "SalesOrder",
          refId: order.id,
          targetRole: "SALES_MANAGER",
        },
      });
      throw new CreditLimitError(
        order.partner.isBlocked
          ? `${order.partner.name} bloklangan — buyurtma tasdiqlanmadi`
          : `Kredit limiti yetarli emas: bo'sh joy ${credit.headroom?.toFixed(0) ?? "0"} soʻm, buyurtma ${totals.net.toFixed(0)} soʻm`,
      );
    }
  }

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      for (const l of order.lines) {
        const item = await tx.inventoryItem.findUnique({
          where: { productId_warehouseId: { productId: l.productId, warehouseId: order.warehouseId } },
        });
        const available = (item?.qtyOnHand ?? 0) - (item?.qtyReserved ?? 0);
        if (available < l.qty) {
          throw new SalesOrderError(
            `Zaxira yetarli emas: kerak ${l.qty}, mavjud ${Math.max(available, 0)}`,
          );
        }
        await tx.inventoryItem.update({
          where: { productId_warehouseId: { productId: l.productId, warehouseId: order.warehouseId } },
          data: { qtyReserved: { increment: l.qty } },
        });
      }
      return tx.salesOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
    }),
  );
}

/**
 * SHIPPED: consume FIFO per line and SEAL cogsUnit + cmUnit (spec v1 §6.4). This
 * is the only place CM is written; everything downstream reads the sealed value,
 * so a later price, fee or rule change can never rewrite a shipped margin.
 */
export async function shipSalesOrder(orderId: string, userId: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: { include: { product: true } }, channel: true },
  });
  if (!canSalesTransition(order.status, "SHIPPED")) {
    throw new SalesOrderError(`Holat oʻtishi taqiqlangan: ${order.status} → SHIPPED`);
  }

  const feeRate = new Prisma.Decimal(order.channel.feeRate);

  return runWithAudit({ userId }, async () => {
    const sealed = await prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      const rows: { lineId: string; cogsUnit: Prisma.Decimal; cmUnit: Prisma.Decimal }[] = [];

      for (const l of order.lines) {
        const { cogsUnit } = await fifoIssue(tx, {
          productId: l.productId,
          warehouseId: order.warehouseId,
          qty: l.qty,
          type: "OUT",
          refType: "SalesOrder",
          refId: order.id,
        });

        const netUnit = new Prisma.Decimal(l.unitPrice)
          .times(new Prisma.Decimal(1).minus(l.discountRate))
          .times(new Prisma.Decimal(1).minus(feeRate));
        const royaltyEstUnit = await royaltyEstimateUnit(
          l.product.titleId,
          l.product.format,
          new Prisma.Decimal(l.unitPrice),
          netUnit,
        );

        const e = lineEconomics({
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountRate: l.discountRate,
          channelFeeRate: feeRate,
          cogsUnit,
          royaltyEstUnit,
          deliveryCostUnit: l.deliveryCostUnit ?? 0,
        });

        const cmUnit = new Prisma.Decimal(e.cmUnit.toFixed(2));
        await tx.salesOrderLine.update({
          where: { id: l.id },
          data: { cogsUnit, cmUnit }, // SEALED
        });
        // Releasing the reservation as the goods leave keeps QoH and Reserved
        // consistent — fifoIssue already decremented qtyOnHand.
        await tx.inventoryItem.update({
          where: { productId_warehouseId: { productId: l.productId, warehouseId: order.warehouseId } },
          data: { qtyReserved: { decrement: l.qty } },
        });
        rows.push({ lineId: l.id, cogsUnit, cmUnit });
      }

      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "SHIPPED", shippedDate: new Date() },
      });
      return rows;
    });

    return { orderId, sealed };
  });
}

/** INVOICED: open AR. Due date = channel payment term, or the partner's. */
export async function invoiceSalesOrder(orderId: string, userId: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, channel: true, partner: true },
  });
  if (!canSalesTransition(order.status, "INVOICED")) {
    throw new SalesOrderError(`Holat oʻtishi taqiqlangan: ${order.status} → INVOICED`);
  }

  const totals = orderTotals(toLineInputs(order.lines, new Prisma.Decimal(order.channel.feeRate)));
  const termDays = order.channel.paymentTermDays || order.partner?.paymentTermDays || 0;
  const invoicedDate = new Date();
  const dueDate = order.dueDate ?? new Date(invoicedDate.getTime() + termDays * 86_400_000);

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.receivable.create({
        data: {
          orderId: order.id,
          partnerId: order.partnerId,
          entityId: order.entityId,
          amountUZS: new Prisma.Decimal(totals.net.toFixed(2)), // SEALED
          dueDate,
          status: "OPEN",
        },
      });
      return tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "INVOICED", invoicedDate, dueDate },
      });
    }),
  );
}

/** CANCELLED: release whatever was reserved. Shipped goods cannot be cancelled. */
export async function cancelSalesOrder(orderId: string, userId: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true },
  });
  if (!canSalesTransition(order.status, "CANCELLED")) {
    throw new SalesOrderError(
      `Bekor qilish mumkin emas (holat: ${order.status}) — joʻnatilgan tovar qaytish orqali qaytadi`,
    );
  }
  const wasReserved = order.status === "CONFIRMED";

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      if (wasReserved) {
        for (const l of order.lines) {
          await tx.inventoryItem.update({
            where: { productId_warehouseId: { productId: l.productId, warehouseId: order.warehouseId } },
            data: { qtyReserved: { decrement: l.qty } },
          });
        }
      }
      return tx.salesOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    }),
  );
}

/** Order card view: sealed line economics plus the channel context. */
export async function getSalesOrder(orderId: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      channel: true,
      entity: true,
      warehouse: { select: { name: true } },
      partner: true,
      receivable: true,
      lines: {
        include: {
          product: { select: { sku: true, format: true, title: { select: { workTitle: true } } } },
          returns: true,
        },
      },
    },
  });

  const feeRate = new Prisma.Decimal(order.channel.feeRate);
  const lines = order.lines.map((l) => {
    const e = lineEconomics({
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountRate: l.discountRate,
      channelFeeRate: feeRate,
      cogsUnit: l.cogsUnit,
      deliveryCostUnit: l.deliveryCostUnit ?? 0,
    });
    return {
      line: l,
      returnedQty: l.returns.reduce((a, r) => a + r.qty, 0),
      economics: e,
      // Before ship nothing is sealed; after ship the DB value is authoritative.
      sealed: l.cogsUnit != null && l.cmUnit != null,
    };
  });

  return {
    order,
    lines,
    totals: orderTotals(toLineInputs(order.lines, feeRate)),
  };
}
