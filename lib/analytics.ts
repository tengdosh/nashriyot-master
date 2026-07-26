import Decimal from "decimal.js";

/**
 * Pure analytics engine — spec v1 §5.8. The service feeds these functions rows
 * it read from the materialized views; everything here is deterministic and
 * unit-tested. Money stays Decimal.
 */

export type Num = Decimal.Value;

// ── Pivot builder (constructor: measure × dimension × [secondary]) ─────────────

export type PivotInput = {
  /** Each fact: a row key, an optional column key, and the measure value. */
  facts: { row: string; col?: string | null; value: Num }[];
  /** Stable order for columns; facts with a col not listed here are still kept. */
  columns?: string[];
};

export type PivotResult = {
  columns: string[];
  rows: { key: string; cells: Record<string, Decimal>; total: Decimal }[];
  columnTotals: Record<string, Decimal>;
  grandTotal: Decimal;
};

const SINGLE_COL = "__total__";

/**
 * Sum `value` into a rows×columns grid with row totals, column totals and a
 * grand total. When no fact carries a column key the pivot collapses to a single
 * measure column, so a one-dimensional report and a cross-tab share one path.
 */
export function buildPivot(input: PivotInput): PivotResult {
  const hasCols = input.facts.some((f) => f.col != null && f.col !== "");
  const colSet = new Set<string>(input.columns ?? []);
  const rowMap = new Map<string, Record<string, Decimal>>();
  const columnTotals: Record<string, Decimal> = {};
  let grandTotal = new Decimal(0);

  for (const f of input.facts) {
    const col = hasCols ? (f.col ?? "—") : SINGLE_COL;
    colSet.add(col);
    const value = new Decimal(f.value);

    const cells = rowMap.get(f.row) ?? {};
    cells[col] = (cells[col] ?? new Decimal(0)).plus(value);
    rowMap.set(f.row, cells);

    columnTotals[col] = (columnTotals[col] ?? new Decimal(0)).plus(value);
    grandTotal = grandTotal.plus(value);
  }

  const columns = input.columns
    ? [...input.columns, ...[...colSet].filter((c) => !input.columns!.includes(c))]
    : [...colSet].sort();

  const rows = [...rowMap.entries()]
    .map(([key, cells]) => {
      const total = columns.reduce((a, c) => a.plus(cells[c] ?? 0), new Decimal(0));
      return { key, cells, total };
    })
    .sort((a, b) => b.total.comparedTo(a.total));

  return { columns, rows, columnTotals, grandTotal };
}

// ── Ranking ───────────────────────────────────────────────────────────────────

export type Ranked<T> = { item: T; value: Decimal };

export function topN<T>(items: { item: T; value: Num }[], n: number): Ranked<T>[] {
  return [...items]
    .map((i) => ({ item: i.item, value: new Decimal(i.value) }))
    .sort((a, b) => b.value.comparedTo(a.value))
    .slice(0, n);
}

export function bottomN<T>(items: { item: T; value: Num }[], n: number): Ranked<T>[] {
  return [...items]
    .map((i) => ({ item: i.item, value: new Decimal(i.value) }))
    .sort((a, b) => a.value.comparedTo(b.value))
    .slice(0, n);
}

/** Period-over-period growth as a ratio; null when there is no base to compare. */
export function growthRate(current: Num, previous: Num): Decimal | null {
  const prev = new Decimal(previous);
  if (prev.isZero()) return null;
  return new Decimal(current).minus(prev).div(prev);
}

// ── Forecast accuracy (MAPE) ──────────────────────────────────────────────────

/**
 * Mean Absolute Percentage Error over aligned (actual, forecast) pairs. Months
 * with zero ACTUAL are skipped — percentage error is undefined against zero, and
 * including them would make MAPE explode or silently read as perfect. Returns
 * null when no comparable month remains.
 */
export function mape(pairs: { actual: Num; forecast: Num }[]): Decimal | null {
  let sum = new Decimal(0);
  let n = 0;
  for (const p of pairs) {
    const actual = new Decimal(p.actual);
    if (actual.isZero()) continue;
    sum = sum.plus(actual.minus(p.forecast).abs().div(actual.abs()));
    n += 1;
  }
  return n === 0 ? null : sum.div(n);
}

// ── Profit & Loss by entity (spec v2 §6) ──────────────────────────────────────

export type PnlLine = {
  entityId: string;
  entityName: string;
  revenue: Num;
  cogs: Num;
  royalty: Num;
  fixedCosts: Num;
};

export type PnlRow = {
  entityId: string;
  entityName: string;
  revenue: Decimal;
  cogs: Decimal;
  grossProfit: Decimal; // revenue − COGS
  royalty: Decimal;
  fixedCosts: Decimal;
  netProfit: Decimal; // gross − royalty − fixed
  grossMargin: Decimal; // gross ÷ revenue
  netMargin: Decimal; // net ÷ revenue
};

/**
 * P&L per entity plus a "Jami" (total) row. Margins divide by revenue and are 0
 * when revenue is 0 (never NaN). The total is summed from the component numbers,
 * not re-derived, so the Jami row always reconciles with the rows above it.
 */
export function pnlRollup(lines: PnlLine[]): { rows: PnlRow[]; total: PnlRow } {
  const rows = lines.map((l) => makePnlRow(l));

  const totalLine: PnlLine = {
    entityId: "__total__",
    entityName: "Jami",
    revenue: rows.reduce((a, r) => a.plus(r.revenue), new Decimal(0)),
    cogs: rows.reduce((a, r) => a.plus(r.cogs), new Decimal(0)),
    royalty: rows.reduce((a, r) => a.plus(r.royalty), new Decimal(0)),
    fixedCosts: rows.reduce((a, r) => a.plus(r.fixedCosts), new Decimal(0)),
  };

  return { rows, total: makePnlRow(totalLine) };
}

function makePnlRow(l: PnlLine): PnlRow {
  const revenue = new Decimal(l.revenue);
  const cogs = new Decimal(l.cogs);
  const royalty = new Decimal(l.royalty);
  const fixedCosts = new Decimal(l.fixedCosts);
  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.minus(royalty).minus(fixedCosts);
  const safeDiv = (n: Decimal) => (revenue.isZero() ? new Decimal(0) : n.div(revenue));
  return {
    entityId: l.entityId,
    entityName: l.entityName,
    revenue,
    cogs,
    grossProfit,
    royalty,
    fixedCosts,
    netProfit,
    grossMargin: safeDiv(grossProfit),
    netMargin: safeDiv(netProfit),
  };
}

// ── Constructor vocabulary (shared by service + UI) ────────────────────────────

export type Measure = "revenue" | "units" | "cm" | "cogs";
export type Dimension = "title" | "channel" | "format" | "month" | "entity";

export const MEASURES: { key: Measure; label: string }[] = [
  { key: "revenue", label: "Sof tushum" },
  { key: "units", label: "Nusxa" },
  { key: "cm", label: "Marja (CM)" },
  { key: "cogs", label: "Tannarx" },
];

export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "title", label: "Asar" },
  { key: "channel", label: "Kanal" },
  { key: "format", label: "Format" },
  { key: "month", label: "Oy" },
  { key: "entity", label: "Sub'ekt" },
];

export function isMeasure(v: string): v is Measure {
  return MEASURES.some((m) => m.key === v);
}
export function isDimension(v: string): v is Dimension {
  return DIMENSIONS.some((d) => d.key === v);
}
