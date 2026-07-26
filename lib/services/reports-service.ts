import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  REPORT_PARAM_SCHEMAS,
  canRunReport,
  isReportName,
  type ReportName,
  type SalesPeriod,
} from "@/lib/reports-catalog";
import { inventoryOverview } from "@/lib/services/reorder-service";
import { deadStockReport } from "@/lib/services/dead-stock-service";
import { agingReport } from "@/lib/services/receivables-service";
import { creditPanel, agentKpiReport, financeOverview } from "@/lib/services/finance-service";
import { costingTable } from "@/lib/services/costing-service";
import { listRoyaltyRuns } from "@/lib/services/royalty-service";
import { breakEvenCrossSoon, daysUntilCross } from "@/lib/costing";

const num = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v).toNumber();

export class ReportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

/** The linked/authenticated identity a report runs as. */
export type ReportCaller = { id: string; permissions: string[]; entityAccess: string[] };

const SHIPPED = ["SHIPPED", "INVOICED", "PAID"] as const;

/** period label → inclusive start Date (spec §5.4 sales-summary). */
export function periodStart(period: SalesPeriod, now = new Date()): Date {
  const d = new Date(now);
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "month":
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    case "quarter":
      return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
    case "year":
      return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  }
}

// ── 1. sales-summary ──────────────────────────────────────────────────────────

async function salesSummary(params: { period: SalesPeriod; channelId?: string; entityId?: string }, caller: ReportCaller, now = new Date()) {
  // Entity restriction is forced in, never trusted from the caller (spec §5.3).
  const entityFilter =
    params.entityId && caller.entityAccess.includes(params.entityId)
      ? [params.entityId]
      : caller.entityAccess;

  const from = periodStart(params.period, now);
  const orders = await prisma.salesOrder.findMany({
    where: {
      status: { in: [...SHIPPED] },
      shippedDate: { gte: from },
      ...(entityFilter.length ? { entityId: { in: entityFilter } } : {}),
      ...(params.channelId ? { channelId: params.channelId } : {}),
    },
    select: {
      channel: { select: { name: true } },
      lines: {
        select: {
          qty: true,
          unitPrice: true,
          discountRate: true,
          cmUnit: true,
          returns: { select: { qty: true } },
          product: { select: { title: { select: { workTitle: true } } } },
        },
      },
    },
  });

  let net = new Prisma.Decimal(0);
  let cm = new Prisma.Decimal(0);
  let units = 0;
  const byChannel = new Map<string, Prisma.Decimal>();
  const byTitle = new Map<string, Prisma.Decimal>();

  for (const o of orders) {
    const ch = o.channel.name;
    for (const l of o.lines) {
      const ret = l.returns.reduce((s, r) => s + r.qty, 0);
      const keptQty = l.qty - ret;
      const netUnit = new Prisma.Decimal(l.unitPrice).times(new Prisma.Decimal(1).minus(l.discountRate));
      const lineNet = netUnit.times(keptQty);
      net = net.plus(lineNet);
      units += keptQty;
      if (l.cmUnit != null) cm = cm.plus(new Prisma.Decimal(l.cmUnit).times(keptQty));
      byChannel.set(ch, (byChannel.get(ch) ?? new Prisma.Decimal(0)).plus(lineNet));
      const t = l.product.title.workTitle;
      byTitle.set(t, (byTitle.get(t) ?? new Prisma.Decimal(0)).plus(lineNet));
    }
  }

  const channels = [...byChannel.entries()]
    .map(([name, v]) => ({ name, net: v.toNumber() }))
    .sort((a, b) => b.net - a.net);
  const top = [...byTitle.entries()]
    .map(([workTitle, v]) => ({ workTitle, net: v.toNumber() }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 5);

  return {
    period: params.period,
    from: from.toISOString(),
    net: net.toNumber(),
    units,
    cm: cm.toNumber(),
    orderCount: orders.length,
    channels,
    top5: top,
  };
}

// ── 2. inventory-status ─────────────────────────────────────────────────────────

async function inventoryStatus(_params: { entityId?: string }, _caller: ReportCaller, now = new Date()) {
  // inventoryOverview aggregates on-hand across all warehouses of a SKU; the ROP
  // overview isn't entity-partitioned, so entity params don't narrow it here.
  const rows = await inventoryOverview(now);

  let totalValue = new Prisma.Decimal(0);
  const rop: { sku: string | null; workTitle: string; available: number; rop: number; suggestQty: number }[] = [];

  for (const r of rows) {
    totalValue = totalValue.plus(new Prisma.Decimal(r.product.listPrice).times(r.qtyOnHand));
    if (r.rop.needsReorder || r.status === "OUT_OF_STOCK" || r.status === "BELOW_ROP") {
      rop.push({
        sku: r.product.sku,
        workTitle: r.product.title.workTitle,
        available: r.available,
        rop: new Prisma.Decimal(r.rop.rop).toNumber(),
        suggestQty: r.rop.suggestQty,
      });
    }
  }

  rop.sort((a, b) => a.available - b.available);
  return { totalValue: totalValue.toNumber(), skuCount: rows.length, ropCount: rop.length, rop: rop.slice(0, 20) };
}

// ── 3. dead-stock ────────────────────────────────────────────────────────────────

async function deadStock() {
  const { flags, totals } = await deadStockReport();
  return {
    frozenCapital: num(totals.total),
    deadCost: num(totals.dead),
    carrying: num(totals.carrying),
    copies: totals.copies,
    flagCount: flags.length,
    top10: flags.slice(0, 10).map((f) => ({
      sku: f.product.sku,
      workTitle: f.product.title.workTitle,
      qtyOnHand: f.qtyOnHand,
      totalLoss: num(f.totalLoss),
      status: f.status,
    })),
  };
}

// ── 4. royalty-liability ──────────────────────────────────────────────────────────

async function royaltyLiability() {
  const runs = await listRoyaltyRuns();
  const pendingApproval = runs.filter((r) => r.status === "DRAFT");
  const latest = runs[0] ?? null;
  const sum = (r: (typeof runs)[number]) => r.statements.reduce((a, s) => a.plus(s.payable), new Prisma.Decimal(0));

  return {
    latestPeriod: latest?.period ?? null,
    latestStatus: latest?.status ?? null,
    latestLiability: latest ? num(sum(latest)) : 0,
    pendingApprovalCount: pendingApproval.length,
    pendingApproval: pendingApproval.slice(0, 10).map((r) => ({
      period: r.period,
      liability: num(sum(r)),
      createdBy: r.createdBy?.fullName ?? null,
      statementCount: r.statements.length,
    })),
  };
}

// ── 5. ar-aging ──────────────────────────────────────────────────────────────────

async function arAging(caller: ReportCaller, now = new Date()) {
  const { rows, summary } = await agingReport(now);
  const scoped = caller.entityAccess.length ? rows.filter((r) => caller.entityAccess.includes(r.entityId)) : rows;
  const credit = await creditPanel();
  const overLimit = credit.filter((c) => c.overLimit);

  return {
    total: scoped.reduce((a, r) => a.plus(r.outstandingUZS), new Prisma.Decimal(0)).toNumber(),
    buckets: {
      CURRENT: num(summary.buckets.CURRENT),
      D0_30: num(summary.buckets.D0_30),
      D31_60: num(summary.buckets.D31_60),
      D61_90: num(summary.buckets.D61_90),
      D90_PLUS: num(summary.buckets.D90_PLUS),
    },
    overdue: num(summary.overdue),
    overLimitCount: overLimit.length,
    overLimit: overLimit.slice(0, 10).map((c) => ({
      partner: c.partnerName,
      outstanding: num(c.outstanding),
      creditLimit: c.creditLimit != null ? num(c.creditLimit) : null,
    })),
  };
}

// ── 6. top-titles ────────────────────────────────────────────────────────────────

async function topTitlesReport(params: { metric: "revenue" | "units" | "cm"; n: number }, now = new Date()) {
  // Lifetime sealed sales of shipped orders, ranked by the chosen metric.
  const lines = await prisma.salesOrderLine.findMany({
    where: { order: { status: { in: [...SHIPPED] } } },
    select: {
      qty: true,
      unitPrice: true,
      discountRate: true,
      cmUnit: true,
      returns: { select: { qty: true } },
      product: { select: { title: { select: { workTitle: true } } } },
    },
  });
  void now;

  const agg = new Map<string, { revenue: Prisma.Decimal; units: number; cm: Prisma.Decimal }>();
  for (const l of lines) {
    const ret = l.returns.reduce((s, r) => s + r.qty, 0);
    const kept = l.qty - ret;
    const netUnit = new Prisma.Decimal(l.unitPrice).times(new Prisma.Decimal(1).minus(l.discountRate));
    const t = l.product.title.workTitle;
    const e = agg.get(t) ?? { revenue: new Prisma.Decimal(0), units: 0, cm: new Prisma.Decimal(0) };
    e.revenue = e.revenue.plus(netUnit.times(kept));
    e.units += kept;
    if (l.cmUnit != null) e.cm = e.cm.plus(new Prisma.Decimal(l.cmUnit).times(kept));
    agg.set(t, e);
  }

  const rows = [...agg.entries()].map(([workTitle, v]) => ({
    workTitle,
    revenue: v.revenue.toNumber(),
    units: v.units,
    cm: v.cm.toNumber(),
  }));
  const key = params.metric;
  rows.sort((a, b) => b[key] - a[key]);
  return { metric: params.metric, rows: rows.slice(0, params.n) };
}

// ── 7. kpi-digest ────────────────────────────────────────────────────────────────

async function kpiDigest(caller: ReportCaller, now = new Date()) {
  const [overview, dead, inv, alerts] = await Promise.all([
    financeOverview(now),
    deadStockReport(),
    inventoryStatus({}, caller, now),
    prisma.notification.groupBy({ by: ["type"], where: { isRead: false }, _count: { _all: true } }),
  ]);

  return {
    cash: num(overview.cashTotal),
    ar: num(overview.arTotal),
    ap: num(overview.apTotal),
    inventoryValue: inv.totalValue,
    ropCount: inv.ropCount,
    frozenCapital: num(dead.totals.total),
    openAlerts: alerts.reduce((a, g) => a + g._count._all, 0),
    alertsByType: alerts.map((g) => ({ type: g.type, count: g._count._all })),
  };
}

// ── 8. costing-risk ──────────────────────────────────────────────────────────────

async function costingRisk() {
  const rows = await costingTable();
  const withSnapshot = rows.filter((r) => r.hasSnapshot && r.reportCost && r.decisionCost);

  const detailed = await Promise.all(
    withSnapshot.map(async (r) => {
      const snaps = await prisma.dailyUnitCost.findMany({
        where: { productId: r.productId },
        orderBy: { date: "desc" },
        take: 2,
        select: { reportCost: true, expNetPrice: true },
      });
      // Slope from the two most recent snapshots (per-day change).
      const report0 = new Prisma.Decimal(snaps[0].reportCost).toNumber();
      const net0 = new Prisma.Decimal(snaps[0].expNetPrice).toNumber();
      const reportSlope = snaps.length > 1 ? report0 - new Prisma.Decimal(snaps[1].reportCost).toNumber() : 0;
      const netSlope = snaps.length > 1 ? net0 - new Prisma.Decimal(snaps[1].expNetPrice).toNumber() : 0;
      const days = daysUntilCross(report0, reportSlope, net0, netSlope);
      return {
        sku: r.sku,
        workTitle: r.workTitle,
        reportCost: r.reportCost!.toNumber(),
        expNet: r.expNet.toNumber(),
        daysUntilCross: days,
        soon: breakEvenCrossSoon(days),
      };
    }),
  );

  const atRisk = detailed.filter((d) => d.soon).sort((a, b) => (a.daysUntilCross ?? 1e9) - (b.daysUntilCross ?? 1e9));
  return { atRiskCount: atRisk.length, scanned: withSnapshot.length, atRisk: atRisk.slice(0, 15) };
}

// ── 9. agents-kpi ────────────────────────────────────────────────────────────────

async function agentsKpi(now = new Date()) {
  const rows = await agentKpiReport(now);
  return {
    agents: rows.map((r) => ({
      partner: r.partnerName,
      discount: r.discount.toNumber(),
      salesNet: r.salesNet.toNumber(),
      collected: r.collected.toNumber(),
      arOutstanding: r.arOutstanding.toNumber(),
      dso: r.dso,
      returnRatePct: Number(r.returnRatePct.toFixed(1)),
      stockAgeDays: r.stockAgeDays,
    })),
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────────

/**
 * Validate + authorize + run a whitelisted report. The caller's permissions and
 * entity access are enforced here — a report can never widen its own scope.
 */
export async function runReport(
  name: string,
  rawParams: unknown,
  caller: ReportCaller,
  now: Date = new Date(),
): Promise<{ data: unknown; params: unknown; generatedAt: string }> {
  if (!isReportName(name)) throw new ReportError(`Noma'lum hisobot: ${name}`, 404);
  if (!canRunReport(name, caller.permissions)) {
    throw new ReportError("Bu hisobot uchun ruxsatingiz yo'q", 403);
  }
  const params = REPORT_PARAM_SCHEMAS[name].parse(rawParams ?? {});

  const data = await dispatch(name, params, caller, now);
  return { data, params, generatedAt: now.toISOString() };
}

async function dispatch(name: ReportName, params: unknown, caller: ReportCaller, now: Date): Promise<unknown> {
  switch (name) {
    case "sales-summary":
      return salesSummary(params as { period: SalesPeriod; channelId?: string; entityId?: string }, caller, now);
    case "inventory-status":
      return inventoryStatus(params as { entityId?: string }, caller, now);
    case "dead-stock":
      return deadStock();
    case "royalty-liability":
      return royaltyLiability();
    case "ar-aging":
      return arAging(caller, now);
    case "top-titles":
      return topTitlesReport(params as { metric: "revenue" | "units" | "cm"; n: number }, now);
    case "kpi-digest":
      return kpiDigest(caller, now);
    case "costing-risk":
      return costingRisk();
    case "agents-kpi":
      return agentsKpi(now);
  }
}
