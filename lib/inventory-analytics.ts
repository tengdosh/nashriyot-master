import Decimal from "decimal.js";
import { deadStockLoss, safetyStock, reorderPoint, eoq } from "./finance";

/**
 * Pure inventory analytics — spec v1 §6.2 (dead-stock scanner) and §6.3
 * (ROP/SS/EOQ/ABC). Every number the /inventory screens or the nightly jobs
 * show comes from here; the services only fetch rows and call these.
 *
 * Money stays Decimal. Counts and day spans stay plain numbers.
 */

export type Num = Decimal.Value;

export class InventoryAnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryAnalyticsError";
  }
}

// ── Demand statistics (v1 §6.3) ───────────────────────────────────────────────

/** Arithmetic mean of a daily-sales series. Empty series → 0. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation (σ) of a daily-sales series. */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Bucket dated sales into one slot per day over the trailing `windowDays`, so
 * σ counts zero-sale days (they are real demand signal, not missing data).
 */
export function dailySeries(
  sales: { date: Date; qty: number }[],
  windowDays: number,
  now: Date = new Date(),
): number[] {
  if (windowDays <= 0) throw new InventoryAnalyticsError("windowDays > 0 boʻlishi kerak");
  const series = new Array<number>(windowDays).fill(0);
  const end = now.getTime();
  for (const s of sales) {
    const ageDays = Math.floor((end - s.date.getTime()) / 86_400_000);
    if (ageDays < 0 || ageDays >= windowDays) continue;
    series[windowDays - 1 - ageDays] += s.qty;
  }
  return series;
}

export type DemandStats = {
  dailyAvg: number;
  sigma: number;
  annualDemand: number;
  windowDays: number;
};

export function demandStats(series: number[], windowDays: number): DemandStats {
  const dailyAvg = mean(series);
  return { dailyAvg, sigma: stdDev(series), annualDemand: dailyAvg * 365, windowDays };
}

// ── ROP / EOQ (v1 §6.3) ───────────────────────────────────────────────────────

export type RopInput = {
  stats: DemandStats;
  leadTimeDays: number;
  serviceLevelZ: Num;
  available: number;
  unitCost: Num;
  carryingRate: Num;
  orderCost: Num;
  manualROP?: number | null;
};

export type RopResult = {
  ss: Decimal;
  rop: Decimal;
  eoq: Decimal;
  needsReorder: boolean;
  suggestQty: number;
  isManual: boolean;
};

/**
 * ROP monitor arithmetic. `manualROP` (reorder_rules.manualROP) overrides the
 * computed point — an override never silently recomputes. `suggestQty` is EOQ
 * rounded up, and 0 when no reorder is due.
 */
export function ropCheck(input: RopInput): RopResult {
  if (input.leadTimeDays <= 0) throw new InventoryAnalyticsError("leadTimeDays > 0 boʻlishi kerak");
  const ss = safetyStock({
    z: input.serviceLevelZ,
    sigma: input.stats.sigma,
    leadTimeDays: input.leadTimeDays,
  });
  const computed = reorderPoint({
    dailyAvg: input.stats.dailyAvg,
    leadTimeDays: input.leadTimeDays,
    safetyStock: ss,
  });
  const isManual = input.manualROP != null;
  const rop = isManual ? new Decimal(input.manualROP as number) : computed;

  // H = unit holding cost for a year = unitCost × carryingRate. A zero-cost or
  // zero-carrying SKU has no economic order quantity — fall back to demand.
  const holdingCost = new Decimal(input.unitCost).times(input.carryingRate);
  const q = holdingCost.lte(0)
    ? new Decimal(input.stats.annualDemand)
    : eoq({ annualDemand: input.stats.annualDemand, orderCost: input.orderCost, holdingCost });

  const needsReorder = new Decimal(input.available).lt(rop);
  return {
    ss,
    rop,
    eoq: q,
    needsReorder,
    suggestQty: needsReorder ? Math.ceil(q.toNumber()) : 0,
    isManual,
  };
}

// ── ABC classification (v1 §6.3) ──────────────────────────────────────────────

export type AbcBucket = "A" | "B" | "C";

export type AbcRow<T> = {
  item: T;
  revenue: Decimal;
  share: Decimal; // this SKU's share of total revenue
  cumulative: Decimal; // running share INCLUDING this SKU
  abcClass: AbcBucket;
};

/**
 * Cumulative-revenue ABC: sort DESC, then A = 0–80%, B = 80–95%, C = 95–100%.
 * The SKU that crosses a boundary belongs to the LOWER band (the classic rule),
 * so the first SKU is always A even if it alone exceeds 80%. Zero total → all C.
 */
export function abcClassify<T>(items: { item: T; revenue: Num }[]): AbcRow<T>[] {
  const rows = items
    .map((i) => ({ item: i.item, revenue: new Decimal(i.revenue) }))
    .sort((a, b) => b.revenue.comparedTo(a.revenue));
  const total = rows.reduce((a, r) => a.plus(r.revenue), new Decimal(0));

  if (total.lte(0)) {
    return rows.map((r) => ({
      ...r,
      share: new Decimal(0),
      cumulative: new Decimal(0),
      abcClass: "C" as AbcBucket,
    }));
  }

  let running = new Decimal(0);
  return rows.map((r) => {
    const share = r.revenue.div(total);
    const previous = running;
    running = running.plus(share);
    // Band is decided by where the SKU STARTS, so a boundary-crossing SKU keeps
    // the better class instead of being demoted by its own size.
    const abcClass: AbcBucket = previous.lt(0.8) ? "A" : previous.lt(0.95) ? "B" : "C";
    return { ...r, share, cumulative: running, abcClass };
  });
}

/** Service level by ABC class (spec: A 99%, B 95%, C 90%). */
export function serviceLevelZFor(abcClass: AbcBucket): Decimal {
  if (abcClass === "A") return new Decimal(2.33);
  if (abcClass === "B") return new Decimal(1.65);
  return new Decimal(1.28);
}

// ── Dead stock (v1 §6.2) ──────────────────────────────────────────────────────

/** Units sold ÷ average stock held. Zero average stock → 0 (never divides). */
export function turnoverRatio(input: { unitsSold: Num; avgQoh: Num }): Decimal {
  const avg = new Decimal(input.avgQoh);
  if (avg.lte(0)) return new Decimal(0);
  return new Decimal(input.unitsSold).div(avg);
}

/**
 * A profitable, still-moving backlist title is NOT dead stock even when it sits
 * past the threshold — this guard is what stops the scanner from recommending
 * we destroy the catalogue's long tail (spec v1 §6.2 `isValuableBacklist`).
 */
export function isValuableBacklist(input: {
  cm12: Num; // 12-month contribution margin
  turnover: Num;
  minTurnover: Num;
  hasSeasonalPattern: boolean;
}): boolean {
  if (new Decimal(input.cm12).lte(0)) return false;
  return input.hasSeasonalPattern || new Decimal(input.turnover).gt(input.minTurnover);
}

/**
 * Seasonal = at least one month spikes to `spikeFactor`× the average of the
 * others. Needs a full year of buckets and some actual sales to mean anything.
 */
export function hasSeasonalPattern(monthlyQty: number[], spikeFactor = 2): boolean {
  if (monthlyQty.length < 12) return false;
  const total = monthlyQty.reduce((a, b) => a + b, 0);
  if (total <= 0) return false;
  return monthlyQty.some((q, i) => {
    const others = monthlyQty.filter((_, j) => j !== i);
    const avgOthers = mean(others);
    // All sales concentrated in one month: total > 0 above means q IS that
    // total, so this is the most seasonal a series can get.
    if (avgOthers <= 0) return true;
    return q >= avgOthers * spikeFactor;
  });
}

export type AgeDiscountTier = { fromDays: number; toDays: number | null; discount: number };

/** First tier whose [fromDays, toDays] window contains `ageDays`; else 0. */
export function ageDiscountFor(ageDays: number, tiers: AgeDiscountTier[]): Decimal {
  const hit = tiers.find(
    (t) => ageDays >= t.fromDays && (t.toDays === null || ageDays <= t.toDays),
  );
  return new Decimal(hit?.discount ?? 0);
}

export type DeadStockAssessment = {
  isDead: boolean;
  reason: "UNDER_THRESHOLD" | "VALUABLE_BACKLIST" | "NO_STOCK" | "DEAD";
  ageDays: number;
  dead: Decimal;
  carrying: Decimal;
  opportunity: Decimal;
  total: Decimal;
  suggestedAction: DisposalStep | null;
  suggestedDiscount: Decimal;
};

export type DisposalStep =
  | "PRICE_CUT"
  | "BUNDLE"
  | "RETURN_TO_SUPPLIER"
  | "WHOLESALE"
  | "DONATION"
  | "WRITE_OFF";

/** The six-step disposal ladder, cheapest remedy first (spec v1 §5.4). */
export const DISPOSAL_LADDER: DisposalStep[] = [
  "PRICE_CUT",
  "BUNDLE",
  "RETURN_TO_SUPPLIER",
  "WHOLESALE",
  "DONATION",
  "WRITE_OFF",
];

/**
 * Climb the ladder with age: the longer it has been frozen, the more drastic the
 * suggested remedy. Steps are one threshold-span apart, capped at WRITE_OFF.
 */
export function suggestDisposal(ageDays: number, thresholdDays: number): DisposalStep {
  if (thresholdDays <= 0) throw new InventoryAnalyticsError("thresholdDays > 0 boʻlishi kerak");
  const step = Math.floor(ageDays / thresholdDays) - 1;
  const idx = Math.min(Math.max(step, 0), DISPOSAL_LADDER.length - 1);
  return DISPOSAL_LADDER[idx];
}

/**
 * The full v1 §6.2 decision for one SKU. Returns the three loss components even
 * when the SKU is not dead (all zero) so callers never branch on shape.
 */
export function assessDeadStock(input: {
  qtyOnHand: number;
  ageDays: number;
  unitCost: Num;
  thresholdDays: number;
  carryingRate: Num;
  expectedROI: Num;
  valuableBacklist: boolean;
  ageDiscountTiers?: AgeDiscountTier[];
}): DeadStockAssessment {
  const zero = new Decimal(0);
  const notDead = (reason: DeadStockAssessment["reason"]): DeadStockAssessment => ({
    isDead: false,
    reason,
    ageDays: input.ageDays,
    dead: zero,
    carrying: zero,
    opportunity: zero,
    total: zero,
    suggestedAction: null,
    suggestedDiscount: zero,
  });

  if (input.qtyOnHand <= 0) return notDead("NO_STOCK");
  if (input.ageDays < input.thresholdDays) return notDead("UNDER_THRESHOLD");
  if (input.valuableBacklist) return notDead("VALUABLE_BACKLIST");

  const loss = deadStockLoss({
    qoh: input.qtyOnHand,
    unitCost: input.unitCost,
    carryingRate: input.carryingRate,
    expectedROI: input.expectedROI,
  });
  return {
    isDead: true,
    reason: "DEAD",
    ageDays: input.ageDays,
    ...loss,
    suggestedAction: suggestDisposal(input.ageDays, input.thresholdDays),
    suggestedDiscount: ageDiscountFor(input.ageDays, input.ageDiscountTiers ?? []),
  };
}

// ── Stock status badge (v1 §5.4) ──────────────────────────────────────────────

export type StockStatus = "OUT_OF_STOCK" | "BELOW_ROP" | "DEAD" | "HEALTHY";

/**
 * Badge precedence: nothing on hand beats every other signal, then a live
 * dead-stock flag, then ROP. A dead SKU is deliberately ranked above ROP so we
 * never suggest reordering a title we are trying to get rid of.
 */
export function stockStatus(input: {
  available: number;
  rop: Num;
  isDead: boolean;
}): StockStatus {
  if (input.available <= 0) return "OUT_OF_STOCK";
  if (input.isDead) return "DEAD";
  if (new Decimal(input.available).lt(input.rop)) return "BELOW_ROP";
  return "HEALTHY";
}

/** Available = on hand − reserved, never negative. */
export function availableQty(qtyOnHand: number, qtyReserved: number): number {
  return Math.max(qtyOnHand - qtyReserved, 0);
}
