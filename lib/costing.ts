import Decimal from "decimal.js";

/**
 * Live unit-cost helpers (spec v2 §5.1 / §7.1). The heavy layer formulas
 * (uniquePerCopy, reportCost, decisionCost, dailyFixedPerCopy, simulate) live in
 * lib/finance.ts; this file adds the daily-carry and trend-crossing pieces that
 * the costing engine needs. All pure and unit-tested.
 *
 * Two numbers always coexist (spec §3):
 *   reportCost   = unique + print + accrued fixed   → profitability / accounting
 *   decisionCost = print + daily holding            → today's pricing floor (sunk-free)
 * They must never be mixed, and the unique/fixed layers never enter decisionCost.
 */

export type Num = Decimal.Value;

export class CostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostingError";
  }
}

/** Daily holding cost of one held copy: printUnit × carryingRate ÷ 365. */
export function holdingPerDay(printUnit: Num, carryingRate: Num): Decimal {
  const rate = new Decimal(carryingRate);
  if (rate.lt(0)) throw new CostingError("carryingRate manfiy boʻlolmaydi");
  return new Decimal(printUnit).times(rate).div(365);
}

/** Margin as a share of expected net price; 0 when there is no price (never NaN). */
export function marginPct(expNet: Num, cost: Num): Decimal {
  const net = new Decimal(expNet);
  if (net.lte(0)) return new Decimal(0);
  return net.minus(cost).div(net);
}

export const CROSS_ALERT_DAYS = 30;

/**
 * When does a RISING reportCost meet a FALLING expected-net line?
 *
 *   reportCost(t) = report0 + reportSlope·t   (slope ≥ 0 as fixed accrues)
 *   expNet(t)     = net0    + netSlope·t       (slope ≤ 0 as the title ages)
 *
 * Returns whole days until the lines meet, or null when they never will within a
 * sane horizon (parallel/diverging, or the crossing is in the past). Already
 * crossed (report0 ≥ net0) → 0. This is the "qaytmas nuqtaga N kun qoldi" signal.
 */
export function daysUntilCross(
  report0: Num,
  reportSlope: Num,
  net0: Num,
  netSlope: Num,
  horizonDays = 3650,
): number | null {
  const r0 = new Decimal(report0);
  const n0 = new Decimal(net0);
  if (r0.gte(n0)) return 0; // report cost already at/above the net price

  // Gap closes at rate (reportSlope − netSlope); with report rising and net
  // falling that difference is positive.
  const closeRate = new Decimal(reportSlope).minus(netSlope);
  if (closeRate.lte(0)) return null; // gap not closing → never crosses

  const days = n0.minus(r0).div(closeRate);
  const d = Math.ceil(days.toNumber());
  return d > horizonDays ? null : d;
}

/** Is a break-even crossing within the alert window? */
export function breakEvenCrossSoon(daysUntil: number | null, threshold = CROSS_ALERT_DAYS): boolean {
  return daysUntil !== null && daysUntil <= threshold;
}

/**
 * Least-squares slope per day of a dated series (for projecting reportCost /
 * expNet forward). Fewer than 2 points → 0 (flat). `x` is days from the first
 * point. Returns { intercept (value at latest point), slopePerDay }.
 */
export function linearTrend(points: { day: number; value: number }[]): { latest: number; slopePerDay: number } {
  if (points.length === 0) return { latest: 0, slopePerDay: 0 };
  if (points.length === 1) return { latest: points[0].value, slopePerDay: 0 };

  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.day, 0);
  const sumY = points.reduce((a, p) => a + p.value, 0);
  const sumXY = points.reduce((a, p) => a + p.day * p.value, 0);
  const sumXX = points.reduce((a, p) => a + p.day * p.day, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const lastDay = points[points.length - 1].day;
  return { latest: intercept + slope * lastDay, slopePerDay: slope };
}
