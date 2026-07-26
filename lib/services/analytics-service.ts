import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import {
  buildPivot,
  pnlRollup,
  topN,
  bottomN,
  mape,
  type Dimension,
  type Measure,
  type PnlLine,
} from "@/lib/analytics";

/**
 * Analytics service (spec v1 §5.8). Reads the materialized views only — never
 * the live tables — so every report agrees with the last refresh and heavy
 * aggregation never runs on the request path. `refreshViews` is the single
 * writer, called nightly and on demand.
 */

export class AnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsError";
  }
}

const VIEWS = ["mv_monthly_sales", "mv_title_kpi", "mv_ar_aging"] as const;

/**
 * Refresh all three views. CONCURRENTLY keeps them readable during the refresh
 * (each has a UNIQUE index for it); the first-ever refresh on an unpopulated
 * view can't be concurrent, so we fall back to a plain refresh once.
 */
export async function refreshViews(userId = "system"): Promise<{ refreshed: string[] }> {
  return runWithAudit({ userId }, async () => {
    const refreshed: string[] = [];
    for (const v of VIEWS) {
      try {
        await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${v}`);
      } catch {
        await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${v}`);
      }
      refreshed.push(v);
    }
    return { refreshed };
  });
}

// ── Constructor query ─────────────────────────────────────────────────────────

type SalesRow = {
  month: string;
  productId: string;
  channelId: string;
  entityId: string;
  units: number;
  net_revenue: string;
  cogs: string;
  cm: string;
  work_title: string | null;
  format: string | null;
  channel_name: string | null;
  entity_name: string | null;
};

const MEASURE_COL: Record<Measure, keyof SalesRow> = {
  revenue: "net_revenue",
  units: "units",
  cm: "cm",
  cogs: "cogs",
};

const DIMENSION_COL: Record<Dimension, keyof SalesRow> = {
  title: "work_title",
  channel: "channel_name",
  format: "format",
  month: "month",
  entity: "entity_name",
};

/**
 * Pull the joined monthly-sales rows for a window, then pivot in memory. The MV
 * carries ids only; we join names here so the pivot keys are human-readable.
 */
async function salesRows(from: string, to: string): Promise<SalesRow[]> {
  return prisma.$queryRaw<SalesRow[]>`
    SELECT ms.month, ms."productId", ms."channelId", ms."entityId",
           ms.units, ms.net_revenue::text AS net_revenue, ms.cogs::text AS cogs, ms.cm::text AS cm,
           t."workTitle" AS work_title, p.format::text AS format,
           sc.name AS channel_name, e.name AS entity_name
    FROM mv_monthly_sales ms
    JOIN "Product" p ON p.id = ms."productId"
    JOIN "Title" t ON t.id = p."titleId"
    JOIN "SalesChannel" sc ON sc.id = ms."channelId"
    JOIN "Entity" e ON e.id = ms."entityId"
    WHERE ms.month >= ${from} AND ms.month <= ${to}
  `;
}

export type ConstructorSpec = {
  measure: Measure;
  dimension: Dimension;
  secondaryDimension?: Dimension | null;
  from: string; // "2026-01"
  to: string; // "2026-12"
};

function cellValue(row: SalesRow, measure: Measure): number {
  const v = row[MEASURE_COL[measure]];
  return typeof v === "number" ? v : Number(v ?? 0);
}

export async function constructorQuery(spec: ConstructorSpec) {
  if (spec.from > spec.to) throw new AnalyticsError("Boshlanish davri tugashdan keyin boʻlolmaydi");
  const rows = await salesRows(spec.from, spec.to);

  const pivot = buildPivot({
    facts: rows.map((r) => ({
      row: String(r[DIMENSION_COL[spec.dimension]] ?? "—"),
      col: spec.secondaryDimension ? String(r[DIMENSION_COL[spec.secondaryDimension]] ?? "—") : null,
      value: cellValue(r, spec.measure),
    })),
  });

  return { spec, pivot };
}

// ── Prebuilt reports ──────────────────────────────────────────────────────────

/** Top-10 titles by net revenue (lifetime, from mv_title_kpi). */
export async function topTitles(n = 10) {
  const rows = await prisma.$queryRaw<{ titleId: string; work_title: string; net_revenue: string; cm: string; units: number }[]>`
    SELECT "titleId", work_title, net_revenue::text AS net_revenue, cm::text AS cm, units
    FROM mv_title_kpi
  `;
  return topN(
    rows.map((r) => ({ item: r, value: r.net_revenue })),
    n,
  );
}

/** Slowest 10: active titles with the least lifetime units. */
export async function slowestTitles(n = 10) {
  const rows = await prisma.$queryRaw<{ titleId: string; work_title: string; units: number; net_revenue: string }[]>`
    SELECT "titleId", work_title, units, net_revenue::text AS net_revenue
    FROM mv_title_kpi
  `;
  return bottomN(
    rows.map((r) => ({ item: r, value: r.units })),
    n,
  );
}

/** Channel profitability: net revenue, CM and CM-rate per channel (lifetime). */
export async function channelProfitability() {
  const rows = await prisma.$queryRaw<{ channel_name: string; net_revenue: string; cogs: string; cm: string; units: number }[]>`
    SELECT sc.name AS channel_name,
           SUM(ms.net_revenue)::text AS net_revenue,
           SUM(ms.cogs)::text AS cogs,
           SUM(ms.cm)::text AS cm,
           SUM(ms.units)::int AS units
    FROM mv_monthly_sales ms
    JOIN "SalesChannel" sc ON sc.id = ms."channelId"
    GROUP BY sc.name
    ORDER BY SUM(ms.cm) DESC
  `;
  return rows.map((r) => {
    const net = new Prisma.Decimal(r.net_revenue);
    const cm = new Prisma.Decimal(r.cm);
    return {
      channel: r.channel_name,
      netRevenue: net,
      cogs: new Prisma.Decimal(r.cogs),
      cm,
      units: r.units,
      cmRate: net.gt(0) ? cm.div(net) : new Prisma.Decimal(0),
    };
  });
}

/** Dead-stock dynamics: live flags with their frozen capital (from M5). */
export async function deadStockDynamics() {
  const flags = await prisma.deadStockFlag.findMany({
    where: { status: { not: "WRITTEN_OFF" } },
    include: { product: { select: { sku: true, title: { select: { workTitle: true } } } } },
    orderBy: { totalLoss: "desc" },
    take: 20,
  });
  const total = flags.reduce((a, f) => a.plus(f.totalLoss), new Prisma.Decimal(0));
  return {
    total,
    count: flags.length,
    rows: flags.map((f) => ({
      workTitle: f.product.title.workTitle,
      sku: f.product.sku,
      qtyOnHand: f.qtyOnHand,
      ageDays: f.ageDays,
      totalLoss: new Prisma.Decimal(f.totalLoss),
    })),
  };
}

/**
 * Forecast accuracy: per product, MAPE of the latest forecast against actual
 * monthly units from mv_monthly_sales. Products with no comparable month are
 * dropped (MAPE undefined).
 */
export async function forecastAccuracy() {
  const forecasts = await prisma.forecast.findMany({
    orderBy: { createdAt: "desc" },
    include: { product: { select: { id: true, sku: true, title: { select: { workTitle: true } } } } },
  });

  // One (latest) forecast per product.
  const latest = new Map<string, (typeof forecasts)[number]>();
  for (const f of forecasts) if (!latest.has(f.productId)) latest.set(f.productId, f);

  const actuals = await prisma.$queryRaw<{ productId: string; month: string; units: number }[]>`
    SELECT "productId", month, units FROM mv_monthly_sales
  `;
  const actualByProduct = new Map<string, Map<string, number>>();
  for (const a of actuals) {
    const m = actualByProduct.get(a.productId) ?? new Map<string, number>();
    m.set(a.month, a.units);
    actualByProduct.set(a.productId, m);
  }

  const out: { productId: string; workTitle: string; sku: string | null; mape: number; storedMape: number | null }[] = [];
  for (const f of latest.values()) {
    const values = (f.values as { month: string; value: number }[] | null) ?? [];
    const am = actualByProduct.get(f.productId);
    if (!am) continue;
    const pairs = values
      .filter((v) => am.has(v.month))
      .map((v) => ({ actual: am.get(v.month)!, forecast: v.value }));
    const m = mape(pairs);
    if (m === null) continue;
    out.push({
      productId: f.productId,
      workTitle: f.product.title.workTitle,
      sku: f.product.sku,
      mape: m.toNumber(),
      storedMape: f.mape != null ? Number(f.mape) : null,
    });
  }
  return out.sort((a, b) => a.mape - b.mape);
}

// ── P&L by entity (spec v2 §6) ────────────────────────────────────────────────

/**
 * Entity P&L for a period. Revenue/COGS/CM come from sealed sales (mv_monthly_sales);
 * royalty from SENT royalty statements whose title belongs to the entity; FIXED
 * costs from cost_entries. The engine (lib/analytics.pnlRollup) adds the Jami row.
 */
export async function pnlByEntity(from: string, to: string) {
  const [sales, royalties, fixed, entities] = await Promise.all([
    prisma.$queryRaw<{ entityId: string; net_revenue: string; cogs: string }[]>`
      SELECT "entityId", SUM(net_revenue)::text AS net_revenue, SUM(cogs)::text AS cogs
      FROM mv_monthly_sales WHERE month >= ${from} AND month <= ${to}
      GROUP BY "entityId"
    `,
    // Royalty earned in SENT runs overlapping the window, attributed to the
    // title's entity.
    prisma.$queryRaw<{ entityId: string; royalty: string }[]>`
      SELECT t."entityId" AS "entityId", SUM(rs.earned)::text AS royalty
      FROM "RoyaltyStatement" rs
      JOIN "RoyaltyRun" rr ON rr.id = rs."runId" AND rr.status = 'SENT'
      JOIN "Contract" c ON c.id = rs."contractId"
      JOIN "Title" t ON t.id = c."titleId"
      WHERE to_char(rr."periodStart", 'YYYY-MM') <= ${to}
        AND to_char(rr."periodEnd", 'YYYY-MM') >= ${from}
      GROUP BY t."entityId"
    `,
    prisma.$queryRaw<{ entityId: string; fixed: string }[]>`
      SELECT "entityId", SUM("amountUZS")::text AS fixed
      FROM "CostEntry"
      WHERE scope = 'FIXED' AND "entityId" IS NOT NULL
        AND to_char(date, 'YYYY-MM') >= ${from} AND to_char(date, 'YYYY-MM') <= ${to}
      GROUP BY "entityId"
    `,
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const salesBy = new Map(sales.map((s) => [s.entityId, s]));
  const royaltyBy = new Map(royalties.map((r) => [r.entityId, r.royalty]));
  const fixedBy = new Map(fixed.map((f) => [f.entityId, f.fixed]));

  const lines: PnlLine[] = entities.map((e) => ({
    entityId: e.id,
    entityName: e.name,
    revenue: salesBy.get(e.id)?.net_revenue ?? 0,
    cogs: salesBy.get(e.id)?.cogs ?? 0,
    royalty: royaltyBy.get(e.id) ?? 0,
    fixedCosts: fixedBy.get(e.id) ?? 0,
  }));

  return pnlRollup(lines);
}

// ── Saved reports ─────────────────────────────────────────────────────────────

export async function saveReport(name: string, spec: ConstructorSpec, userId: string) {
  return runWithAudit({ userId }, async () =>
    prisma.savedReport.create({
      data: { name, spec: spec as unknown as Prisma.InputJsonValue, createdById: userId },
    }),
  );
}

export async function listSavedReports() {
  return prisma.savedReport.findMany({
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteSavedReport(id: string, userId: string) {
  return runWithAudit({ userId }, async () => prisma.savedReport.delete({ where: { id } }));
}
