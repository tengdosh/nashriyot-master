import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { uniquePerCopy, reportCost, decisionCost, dailyFixedPerCopy } from "@/lib/finance";
import { holdingPerDay, daysUntilCross, breakEvenCrossSoon, linearTrend, marginPct } from "@/lib/costing";
import { getInventorySettings } from "./inventory-settings";
import { fifoAvgUnitCost, quantityOnHand } from "./inventory-service";

/**
 * Live unit-cost engine (spec v2 §5.1). Keeps three cost layers SEPARATE in the
 * DB and only combines them in daily_unit_cost — never double-counting:
 *   - unique layer: Σ TITLE cost_entries ÷ Σ plannedRuns (all editions)
 *   - print layer:  FIFO weighted average (print only)
 *   - fixed layer:  copy-day allocation, accumulated day over day
 *
 * reportCost = unique + print + accruedFixed   (accounting / profitability)
 * decisionCost = print + dailyHolding          (today's pricing floor, sunk-free)
 */

export class CostingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostingServiceError";
  }
}

/** Unique-cost-per-copy for a product's title: Σ TITLE costs ÷ Σ plannedRuns. */
async function uniqueLayer(titleId: string): Promise<Prisma.Decimal> {
  const [costs, editions] = await Promise.all([
    prisma.costEntry.aggregate({
      where: { scope: "TITLE", titleId },
      _sum: { amountUZS: true },
    }),
    prisma.edition.findMany({ where: { titleId }, select: { plannedRun: true } }),
  ]);
  const totalTitleCost = new Prisma.Decimal(costs._sum.amountUZS ?? 0);
  const totalPlannedRuns = editions.reduce((a, e) => a + (e.plannedRun ?? 0), 0);
  if (totalPlannedRuns <= 0 || totalTitleCost.lte(0)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(
    uniquePerCopy({ titleCosts: [totalTitleCost], totalPlannedRuns }).toFixed(2),
  );
}

/** Today's fixed-per-copy across the entity: month pool ÷ days ÷ copies on hand. */
async function todaysFixedPerCopy(entityId: string, now: Date): Promise<Prisma.Decimal> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();

  const pool = await prisma.costEntry.aggregate({
    where: { scope: "FIXED", entityId, date: { gte: monthStart, lte: monthEnd } },
    _sum: { amountUZS: true },
  });
  const fixedMonth = new Prisma.Decimal(pool._sum.amountUZS ?? 0);
  if (fixedMonth.lte(0)) return new Prisma.Decimal(0);

  // Total copies on hand across the entity's products (copy-day denominator).
  const copies = await prisma.inventoryItem.aggregate({
    where: { product: { title: { entityId } } },
    _sum: { qtyOnHand: true },
  });
  const totalCopies = copies._sum.qtyOnHand ?? 0;

  return new Prisma.Decimal(
    dailyFixedPerCopy({
      fixedMonth,
      days: daysInMonth,
      totalCopies,
    }).toFixed(4),
  );
}

/** Expected net price: quantity-weighted sealed net over the last 90 days, else list. */
async function expectedNetPrice(productId: string, listPrice: Prisma.Decimal, now: Date): Promise<Prisma.Decimal> {
  const from = new Date(now.getTime() - 90 * 86_400_000);
  const lines = await prisma.salesOrderLine.findMany({
    where: {
      productId,
      order: { status: { in: ["SHIPPED", "INVOICED", "PAID"] }, shippedDate: { gte: from } },
    },
    select: {
      qty: true,
      unitPrice: true,
      discountRate: true,
      order: { select: { channel: { select: { feeRate: true } } } },
    },
  });
  let money = new Prisma.Decimal(0);
  let qty = 0;
  for (const l of lines) {
    const net = new Prisma.Decimal(l.unitPrice)
      .times(new Prisma.Decimal(1).minus(l.discountRate))
      .times(new Prisma.Decimal(1).minus(l.order.channel.feeRate));
    money = money.plus(net.times(l.qty));
    qty += l.qty;
  }
  return qty > 0 ? money.div(qty) : new Prisma.Decimal(listPrice);
}

/**
 * Compute and persist today's daily_unit_cost for one product. The fixed layer
 * accumulates onto the previous snapshot's `allocFixedCum` (spec's "cumulative"),
 * so a re-run on the same day is idempotent (upsert by [productId, date]).
 */
export async function computeDailyCost(productId: string, userId = "system", now: Date = new Date()) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, titleId: true, editionId: true, listPrice: true, title: { select: { entityId: true } } },
  });

  const settings = await getInventorySettings();
  const entityId = product.title.entityId;
  const [unique, printUnit, fixedToday, expNet] = await Promise.all([
    uniqueLayer(product.titleId),
    fifoAvgUnitCost(productId),
    entityId ? todaysFixedPerCopy(entityId, now) : Promise.resolve(new Prisma.Decimal(0)),
    expectedNetPrice(productId, new Prisma.Decimal(product.listPrice), now),
  ]);

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const prior = await prisma.dailyUnitCost.findFirst({
    where: { productId, date: { lt: today } },
    orderBy: { date: "desc" },
  });
  const priorFixedCum = new Prisma.Decimal(prior?.allocFixedCum ?? 0);
  const allocFixedCum = priorFixedCum.plus(fixedToday);

  const report = new Prisma.Decimal(
    reportCost({ uniquePerCopy: unique, printUnit, allocFixedCum }).toFixed(2),
  );
  const decision = new Prisma.Decimal(
    decisionCost({ printUnit, holdingPerDay: holdingPerDay(printUnit, settings.carryingRate) }).toFixed(2),
  );

  return runWithAudit({ userId }, async () =>
    prisma.dailyUnitCost.upsert({
      where: { productId_date: { productId, date: today } },
      update: { baseUnit: printUnit, allocFixedCum, reportCost: report, decisionCost: decision, expNetPrice: expNet },
      create: {
        productId,
        editionId: product.editionId,
        date: today,
        baseUnit: printUnit,
        allocFixedCum,
        reportCost: report,
        decisionCost: decision,
        expNetPrice: expNet,
      },
    }),
  );
}

/** The pricing floor for a SKU: today's sunk-free decisionCost, or null if none. */
export async function getDecisionFloor(productId: string): Promise<Prisma.Decimal | null> {
  const latest = await prisma.dailyUnitCost.findFirst({
    where: { productId },
    orderBy: { date: "desc" },
    select: { decisionCost: true },
  });
  return latest ? new Prisma.Decimal(latest.decisionCost) : null;
}

/** Latest reportCost for a SKU (dead-stock valuation), or null if none. */
export async function getReportCost(productId: string): Promise<Prisma.Decimal | null> {
  const latest = await prisma.dailyUnitCost.findFirst({
    where: { productId },
    orderBy: { date: "desc" },
    select: { reportCost: true },
  });
  return latest ? new Prisma.Decimal(latest.reportCost) : null;
}

export type CostingSnapshotResult = { scanned: number; snapshotted: number; alerts: number };

/**
 * Nightly snapshot of daily_unit_cost for every active, in-stock SKU. Raises a
 * BREAK_EVEN alert when the reportCost trend is within 30 days of crossing the
 * expected-net trend (spec §6: "qaytmas nuqtaga 30 kun qolganda alert").
 */
export async function snapshotAllCosts(
  opts: { userId: string; now?: Date } = { userId: "system" },
): Promise<CostingSnapshotResult> {
  const now = opts.now ?? new Date();
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: { id: true, sku: true, title: { select: { workTitle: true } } },
  });

  const out: CostingSnapshotResult = { scanned: products.length, snapshotted: 0, alerts: 0 };

  return runWithAudit({ userId: opts.userId }, async () => {
    for (const p of products) {
      if ((await quantityOnHand(p.id)) <= 0) continue;
      await computeDailyCost(p.id, opts.userId, now);
      out.snapshotted += 1;

      // Trend from the last 60 days of snapshots → cross projection.
      const hist = await prisma.dailyUnitCost.findMany({
        where: { productId: p.id, date: { gte: new Date(now.getTime() - 60 * 86_400_000) } },
        orderBy: { date: "asc" },
      });
      if (hist.length < 2) continue;
      const base = hist[0].date.getTime();
      const day = (d: Date) => Math.round((d.getTime() - base) / 86_400_000);
      const reportTrend = linearTrend(hist.map((h) => ({ day: day(h.date), value: Number(h.reportCost) })));
      const netTrend = linearTrend(hist.map((h) => ({ day: day(h.date), value: Number(h.expNetPrice) })));
      const cross = daysUntilCross(
        reportTrend.latest,
        reportTrend.slopePerDay,
        netTrend.latest,
        netTrend.slopePerDay,
      );
      if (!breakEvenCrossSoon(cross)) continue;

      const existing = await prisma.notification.findFirst({
        where: { type: "BREAK_EVEN", refType: "Product", refId: p.id, isRead: false },
      });
      if (existing) continue;
      await prisma.notification.create({
        data: {
          type: "BREAK_EVEN",
          severity: cross === 0 ? "CRITICAL" : "WARNING",
          title: "Qaytmas nuqtaga yaqin",
          body: `${p.title.workTitle}${p.sku ? ` (${p.sku})` : ""}: reportCost expNet bilan ~${cross} kunda kesishadi`,
          linkUrl: `/costing/${p.id}`,
          refType: "Product",
          refId: p.id,
          targetRole: "DIRECTOR",
        },
      });
      out.alerts += 1;
    }
    return out;
  });
}

/** /costing table rows: latest snapshot per product with margin. */
export async function costingTable() {
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      sku: true,
      listPrice: true,
      title: { select: { workTitle: true } },
      dailyUnitCosts: { orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return products.map((p) => {
    const duc = p.dailyUnitCosts[0];
    const report = duc ? new Prisma.Decimal(duc.reportCost) : null;
    const decision = duc ? new Prisma.Decimal(duc.decisionCost) : null;
    const expNet = duc ? new Prisma.Decimal(duc.expNetPrice) : new Prisma.Decimal(p.listPrice);
    return {
      productId: p.id,
      sku: p.sku,
      workTitle: p.title.workTitle,
      reportCost: report,
      decisionCost: decision,
      expNet,
      reportMargin: report ? marginPct(expNet, report) : null,
      hasSnapshot: !!duc,
    };
  });
}

/** /costing/[sku] detail: full snapshot history + latest layer breakdown. */
export async function costingDetail(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, sku: true, listPrice: true, titleId: true, title: { select: { workTitle: true } } },
  });
  const [history, unique, printUnit] = await Promise.all([
    prisma.dailyUnitCost.findMany({ where: { productId }, orderBy: { date: "asc" }, take: 180 }),
    uniqueLayer(product.titleId),
    fifoAvgUnitCost(productId),
  ]);
  const latest = history[history.length - 1];
  const accruedFixed = latest ? new Prisma.Decimal(latest.allocFixedCum) : new Prisma.Decimal(0);
  return {
    product,
    history: history.map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      reportCost: Number(h.reportCost),
      decisionCost: Number(h.decisionCost),
      expNet: Number(h.expNetPrice),
    })),
    layers: {
      unique: unique.toNumber(),
      print: printUnit.toNumber(),
      accruedFixed: accruedFixed.toNumber(),
    },
  };
}
