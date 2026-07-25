import { Prisma, type DisposalAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { assertDifferentApprover } from "@/lib/maker-checker";
import {
  assessDeadStock,
  hasSeasonalPattern,
  isValuableBacklist,
  turnoverRatio,
} from "@/lib/inventory-analytics";
import { getInventorySettings, type InventorySettings } from "./inventory-settings";
import { fifoAvgUnitCost, fifoIssue, lastSaleAgeDays, quantityOnHand, InventoryError } from "./inventory-service";

export class WriteDownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteDownError";
  }
}

/**
 * 12-month contribution margin and turnover for the valuable-backlist guard.
 *
 * CM12 comes from the SEALED `cmUnit` on shipped sales-order lines (M6), net of
 * returns — the same number the sales module reports, never a recomputation.
 *
 * Copies issued WITHOUT a sales order (opening balances, migrated history) have
 * no sealed CM, so they are valued at list price minus their FIFO cost. That
 * keeps a legacy SKU from looking margin-less and being wrongly disposed of.
 */
async function backlistSignals(productId: string, now: Date) {
  const from = new Date(now.getTime() - 365 * 86_400_000);
  const [product, outs, avgQoh, soldLines] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { listPrice: true } }),
    prisma.stockMovement.findMany({
      where: { productId, type: "OUT", date: { gte: from } },
      select: { qty: true, unitCost: true, date: true, refType: true },
    }),
    quantityOnHand(productId),
    prisma.salesOrderLine.findMany({
      where: {
        productId,
        cmUnit: { not: null },
        order: { status: { in: ["SHIPPED", "INVOICED", "PAID"] }, shippedDate: { gte: from } },
      },
      select: { qty: true, cmUnit: true, returns: { select: { qty: true } } },
    }),
  ]);

  let cm12 = new Prisma.Decimal(0);
  // Sealed CM on the copies the customer kept.
  for (const l of soldLines) {
    const returned = l.returns.reduce((a, r) => a + r.qty, 0);
    cm12 = cm12.plus(new Prisma.Decimal(l.cmUnit!).times(l.qty - returned));
  }

  let unitsSold = 0;
  const monthly = new Array<number>(12).fill(0);
  for (const o of outs) {
    unitsSold += o.qty;
    if (o.refType !== "SalesOrder") {
      // No sealed CM for this movement — value it at list minus FIFO cost.
      const cogsUnit = new Prisma.Decimal(o.unitCost ?? 0);
      cm12 = cm12.plus(new Prisma.Decimal(product.listPrice).minus(cogsUnit).times(o.qty));
    }
    const monthsAgo = Math.floor((now.getTime() - o.date.getTime()) / (30 * 86_400_000));
    if (monthsAgo >= 0 && monthsAgo < 12) monthly[11 - monthsAgo] += o.qty;
  }

  return {
    cm12,
    unitsSold,
    turnover: turnoverRatio({ unitsSold, avgQoh }),
    seasonal: hasSeasonalPattern(monthly),
  };
}

export type ScanResult = {
  scanned: number;
  flagged: number;
  cleared: number;
  protectedBacklist: number;
  totalFrozen: Prisma.Decimal;
};

/**
 * Nightly dead-stock scan (spec v1 §6.2, 02:00). Idempotent: one flag per SKU,
 * upserted; a SKU that has started moving again has its flag cleared instead of
 * lingering. Settings are sealed onto each flag.
 *
 * WRITTEN_OFF flags are left alone — that decision has already been approved.
 */
export async function scanDeadStock(
  opts: { userId: string; now?: Date; settings?: InventorySettings } = { userId: "system" },
): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const cfg = opts.settings ?? (await getInventorySettings());

  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: { id: true, sku: true, title: { select: { workTitle: true } } },
  });

  const result: ScanResult = {
    scanned: products.length,
    flagged: 0,
    cleared: 0,
    protectedBacklist: 0,
    totalFrozen: new Prisma.Decimal(0),
  };

  return runWithAudit({ userId: opts.userId }, async () => {
    for (const p of products) {
      const existing = await prisma.deadStockFlag.findUnique({ where: { productId: p.id } });
      if (existing?.status === "WRITTEN_OFF") continue;

      const [qtyOnHand, ageDays, unitCost, signals] = await Promise.all([
        quantityOnHand(p.id),
        lastSaleAgeDays(p.id, now),
        fifoAvgUnitCost(p.id),
        backlistSignals(p.id, now),
      ]);

      const valuableBacklist = isValuableBacklist({
        cm12: signals.cm12,
        turnover: signals.turnover,
        minTurnover: cfg.minTurnover,
        hasSeasonalPattern: signals.seasonal,
      });

      const a = assessDeadStock({
        qtyOnHand,
        ageDays,
        unitCost,
        thresholdDays: cfg.deadStockDays,
        carryingRate: cfg.carryingRate,
        expectedROI: cfg.expectedROI,
        valuableBacklist,
        ageDiscountTiers: cfg.ageDiscountTiers,
      });

      if (!a.isDead) {
        if (a.reason === "VALUABLE_BACKLIST") result.protectedBacklist += 1;
        if (existing) {
          await prisma.deadStockFlag.delete({ where: { productId: p.id } });
          result.cleared += 1;
        }
        continue;
      }

      const data = {
        ageDays: a.ageDays,
        qtyOnHand,
        unitCost: new Prisma.Decimal(unitCost),
        deadCost: a.dead,
        carryingCost: a.carrying,
        opportunityCost: a.opportunity,
        totalLoss: a.total,
        carryingRate: new Prisma.Decimal(cfg.carryingRate),
        expectedROI: new Prisma.Decimal(cfg.expectedROI),
        thresholdDays: cfg.deadStockDays,
        suggestedAction: a.suggestedAction as DisposalAction | null,
        suggestedDiscount: a.suggestedDiscount,
        scannedAt: now,
      };

      await prisma.deadStockFlag.upsert({
        where: { productId: p.id },
        // Keep an in-progress disposal in progress; only refresh the numbers.
        update: data,
        create: { productId: p.id, status: "OPEN", ...data },
      });

      result.flagged += 1;
      result.totalFrozen = result.totalFrozen.plus(a.total);

      // Notify once per SKU per scan — the alert links to the screen that fixes it.
      if (!existing) {
        await prisma.notification.create({
          data: {
            type: "DEAD_STOCK",
            severity: a.total.gte(50_000_000) ? "CRITICAL" : "WARNING",
            title: "Oʻlik zaxira aniqlandi",
            body: `${p.title.workTitle}${p.sku ? ` (${p.sku})` : ""}: ${qtyOnHand} dona, ${a.ageDays} kun harakatsiz, jami zarar ${a.total.toFixed(0)} soʻm`,
            linkUrl: "/inventory/dead-stock",
            refType: "Product",
            refId: p.id,
            targetRole: "SALES_MANAGER",
          },
        });
      }
    }
    return result;
  });
}

/** Move a flag into the disposal wizard at the chosen ladder step. */
export async function startDisposal(productId: string, action: DisposalAction, userId: string) {
  return runWithAudit({ userId }, async () =>
    prisma.deadStockFlag.update({
      where: { productId },
      data: { status: "IN_PROGRESS", suggestedAction: action },
    }),
  );
}

/**
 * Step 6 of the ladder — submit a write-down for approval. Creating it never
 * touches stock; only approval does. Maker-checker is enforced on approve.
 */
export async function createWriteDown(
  input: {
    productId: string;
    warehouseId: string;
    qty: number;
    action?: DisposalAction;
    reason: string;
  },
  userId: string,
) {
  if (input.qty <= 0) throw new WriteDownError("Hisobdan chiqarish miqdori 0 dan katta boʻlishi kerak");
  if (!input.reason.trim()) throw new WriteDownError("Hisobdan chiqarish uchun sabab majburiy");

  const onHand = await prisma.inventoryItem.findUnique({
    where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
  });
  if (!onHand || onHand.qtyOnHand < input.qty) {
    throw new WriteDownError("Omborda yetarli qoldiq yoʻq");
  }

  const unitCost = await fifoAvgUnitCost(input.productId, input.warehouseId);

  return runWithAudit({ userId }, async () =>
    prisma.writeDown.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: input.qty,
        unitCost,
        amountUZS: unitCost.times(input.qty),
        action: input.action ?? "WRITE_OFF",
        reason: input.reason,
        status: "PENDING_APPROVAL",
        createdById: userId,
      },
    }),
  );
}

/**
 * Approve a write-down: maker-checker first, then consume the stock FIFO in a
 * transaction and mark the flag WRITTEN_OFF. The FIFO OUT is typed ADJUST, not
 * OUT, so a write-off can never be mistaken for a sale.
 */
export async function approveWriteDown(writeDownId: string, approverId: string) {
  const wd = await prisma.writeDown.findUniqueOrThrow({ where: { id: writeDownId } });
  if (wd.status !== "PENDING_APPROVAL") {
    throw new WriteDownError(`Faqat tasdiq kutayotgan hujjat tasdiqlanadi (holat: ${wd.status})`);
  }
  assertDifferentApprover(wd.createdById, approverId);

  return runWithAudit({ userId: approverId }, async () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      await fifoIssue(tx, {
        productId: wd.productId,
        warehouseId: wd.warehouseId,
        qty: wd.qty,
        type: "ADJUST",
        refType: "WriteDown",
        refId: wd.id,
        reason: wd.reason,
      });
      await tx.deadStockFlag.updateMany({
        where: { productId: wd.productId },
        data: { status: "WRITTEN_OFF" },
      });
      return tx.writeDown.update({
        where: { id: wd.id },
        data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date() },
      });
    }),
  );
}

export async function rejectWriteDown(writeDownId: string, approverId: string, reason: string) {
  const wd = await prisma.writeDown.findUniqueOrThrow({ where: { id: writeDownId } });
  if (wd.status !== "PENDING_APPROVAL") {
    throw new WriteDownError("Faqat tasdiq kutayotgan hujjat rad etiladi");
  }
  assertDifferentApprover(wd.createdById, approverId);
  if (!reason.trim()) throw new WriteDownError("Rad etish uchun sabab majburiy");

  return runWithAudit({ userId: approverId }, async () =>
    prisma.writeDown.update({
      where: { id: wd.id },
      data: {
        status: "REJECTED",
        approvedById: approverId,
        approvedAt: new Date(),
        reason: `${wd.reason} · RAD: ${reason}`,
      },
    }),
  );
}

/** Frozen-capital KPI + the loss table rows for /inventory/dead-stock. */
export async function deadStockReport() {
  const flags = await prisma.deadStockFlag.findMany({
    where: { status: { not: "WRITTEN_OFF" } },
    include: {
      product: {
        select: { id: true, sku: true, isbn13: true, format: true, listPrice: true, title: { select: { workTitle: true } } },
      },
    },
    orderBy: { totalLoss: "desc" },
  });

  const totals = flags.reduce(
    (acc, f) => ({
      dead: acc.dead.plus(f.deadCost),
      carrying: acc.carrying.plus(f.carryingCost),
      opportunity: acc.opportunity.plus(f.opportunityCost),
      total: acc.total.plus(f.totalLoss),
      copies: acc.copies + f.qtyOnHand,
    }),
    {
      dead: new Prisma.Decimal(0),
      carrying: new Prisma.Decimal(0),
      opportunity: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
      copies: 0,
    },
  );

  return { flags, totals };
}

/** Guard used by the UI before offering the disposal wizard. */
export async function requireOpenFlag(productId: string) {
  const flag = await prisma.deadStockFlag.findUnique({ where: { productId } });
  if (!flag) throw new InventoryError("Bu SKU oʻlik zaxira sifatida belgilanmagan");
  return flag;
}
