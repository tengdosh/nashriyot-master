import Decimal from "decimal.js";

/**
 * All financial formulas live here as PURE functions (spec: lib/finance.ts is the
 * single source of truth; never duplicate a formula in a component). Client-safe:
 * no Prisma / server imports, so the UI can run these live (<100ms).
 *
 * v1 §6.1 core + v1 §6.2/§6.3 (dead-stock, ROP/SS/EOQ) + v2 §7.1–7.2 (live unit
 * cost engine, scenario simulator).
 */
export type Num = Decimal.Value;

export class FinanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceError";
  }
}

const D = (v: Num) => new Decimal(v);
const sum = (xs: Num[]) => xs.reduce<Decimal>((a, c) => a.plus(c), new Decimal(0));

// ── v1 §6.1 — cost & pricing core ─────────────────────────────────────────────

/** PC = fixedPrintCost + pages * perPageCost */
export function printCost(input: { fixedPrintCost: Num; pages: Num; perPageCost: Num }): Decimal {
  return D(input.fixedPrintCost).plus(D(input.pages).times(input.perPageCost));
}

/** TC = Σ fixedCosts + printRun * pc */
export function totalCost(input: { fixedCosts: Num[]; printRun: Num; pc: Num }): Decimal {
  return sum(input.fixedCosts).plus(D(input.printRun).times(input.pc));
}

/** UC = tc / (printRun * sellThroughRate); requires 0 < sellThroughRate <= 1 */
export function unitCost(input: { tc: Num; printRun: Num; sellThroughRate: Num }): Decimal {
  const st = D(input.sellThroughRate);
  if (st.lte(0)) throw new FinanceError("sellThroughRate 0 dan katta boʻlishi kerak");
  if (st.gt(1)) throw new FinanceError("sellThroughRate 1 dan katta boʻlolmaydi");
  return D(input.tc).div(D(input.printRun).times(st));
}

/** P_min = uc / (1 - discountRate - royaltyRate); denom must be > 0 */
export function minViablePrice(input: { uc: Num; discountRate: Num; royaltyRate: Num }): Decimal {
  const denom = new Decimal(1).minus(input.discountRate).minus(input.royaltyRate);
  if (denom.lte(0)) throw new FinanceError("P_min: maxraj (denom) <= 0");
  return D(input.uc).div(denom);
}

/** Round a price to a "pretty" value (nearest 100). */
export function roundToPretty(value: Num): Decimal {
  return D(value).div(100).round().times(100);
}

/** RRP = roundToPretty(uc / (1 - discount - royalty - margin)); denom must be > 0 */
export function rrp(input: {
  uc: Num;
  discountRate: Num;
  royaltyRate: Num;
  targetMargin: Num;
}): Decimal {
  const denom = new Decimal(1)
    .minus(input.discountRate)
    .minus(input.royaltyRate)
    .minus(input.targetMargin);
  if (denom.lte(0)) throw new FinanceError("RRP: maxraj (denom) <= 0");
  return roundToPretty(D(input.uc).div(denom));
}

/** breakEvenUnits = ceil(Σ fixedCosts / netPerUnit) */
export function breakEvenUnits(input: {
  fixedCosts: Num[];
  price: Num;
  discountRate: Num;
  royaltyRate: Num;
  pc: Num;
}): Decimal {
  const p = D(input.price);
  const netPerUnit = p
    .times(new Decimal(1).minus(input.discountRate))
    .minus(p.times(input.royaltyRate))
    .minus(input.pc);
  if (netPerUnit.lte(0)) throw new FinanceError("breakEven: netPerUnit <= 0");
  return sum(input.fixedCosts).div(netPerUnit).ceil();
}

/** CM = unitPrice*(1-discount) - channelFee - cogsUnit - royaltyEst - shippingPerUnit */
export function contributionMargin(input: {
  unitPrice: Num;
  discountRate: Num;
  cogsUnit: Num;
  channelFee?: Num;
  royaltyEst?: Num;
  shippingPerUnit?: Num;
}): Decimal {
  const net = D(input.unitPrice)
    .times(new Decimal(1).minus(input.discountRate))
    .minus(input.channelFee ?? 0);
  return net.minus(input.cogsUnit).minus(input.royaltyEst ?? 0).minus(input.shippingPerUnit ?? 0);
}

// ── v1 §6.2 — dead-stock loss ─────────────────────────────────────────────────

export function deadStockLoss(input: {
  qoh: Num;
  unitCost: Num;
  carryingRate: Num;
  expectedROI: Num;
}): { dead: Decimal; carrying: Decimal; opportunity: Decimal; total: Decimal } {
  const dead = D(input.qoh).times(input.unitCost);
  const carrying = dead.times(input.carryingRate);
  const opportunity = dead.times(input.expectedROI);
  return { dead, carrying, opportunity, total: dead.plus(carrying).plus(opportunity) };
}

// ── v1 §6.3 — ROP / safety stock / EOQ ────────────────────────────────────────

/** SS = Z * sigma * sqrt(L) */
export function safetyStock(input: { z: Num; sigma: Num; leadTimeDays: Num }): Decimal {
  return D(input.z).times(input.sigma).times(D(input.leadTimeDays).sqrt());
}

/** ROP = dailyAvg * L + SS */
export function reorderPoint(input: { dailyAvg: Num; leadTimeDays: Num; safetyStock: Num }): Decimal {
  return D(input.dailyAvg).times(input.leadTimeDays).plus(input.safetyStock);
}

/** EOQ = sqrt(2 * D * S / H) */
export function eoq(input: { annualDemand: Num; orderCost: Num; holdingCost: Num }): Decimal {
  const h = D(input.holdingCost);
  if (h.lte(0)) throw new FinanceError("EOQ: holdingCost <= 0");
  return new Decimal(2).times(input.annualDemand).times(input.orderCost).div(h).sqrt();
}

// ── v2 §7.1 — live unit cost layers ───────────────────────────────────────────

/**
 * uniquePerCopy = Σ titleCosts / Σ plannedRuns (across ALL editions).
 * Adding a 2nd edition grows the denominator → the unique load per copy DROPS.
 */
export function uniquePerCopy(input: { titleCosts: Num[]; totalPlannedRuns: Num }): Decimal {
  const denom = D(input.totalPlannedRuns);
  if (denom.lte(0)) throw new FinanceError("uniquePerCopy: Σ plannedRuns 0 dan katta boʻlishi kerak");
  return sum(input.titleCosts).div(denom);
}

/** dailyFixedPerCopy = (fixedMonth / days) / max(totalCopies, 1) */
export function dailyFixedPerCopy(input: { fixedMonth: Num; days: Num; totalCopies: Num }): Decimal {
  const days = D(input.days);
  if (days.lte(0)) throw new FinanceError("dailyFixedPerCopy: days 0 dan katta boʻlishi kerak");
  const copies = Decimal.max(D(input.totalCopies), 1);
  return D(input.fixedMonth).div(days).div(copies);
}

/** reportCost = uniquePerCopy + printUnit + allocFixedCum (full cost, for profit). */
export function reportCost(input: { uniquePerCopy: Num; printUnit: Num; allocFixedCum: Num }): Decimal {
  return D(input.uniquePerCopy).plus(input.printUnit).plus(input.allocFixedCum);
}

/** decisionCost = printUnit + holdingPerDay (SUNK-FREE: no unique, no accrued fixed). */
export function decisionCost(input: { printUnit: Num; holdingPerDay: Num }): Decimal {
  return D(input.printUnit).plus(input.holdingPerDay);
}

// ── v2 §7.2 — scenario simulator ──────────────────────────────────────────────

export function simulate(input: {
  months: Num;
  unitsToSell: Num;
  startCopies: Num;
  uniquePerCopy: Num;
  printUnit: Num;
  dailyFixedPerCopy: Num;
  expectedNetPrice: Num;
}): { finalUnitCost: Decimal; profit: Decimal; breakEvenDay: number | null; days: number } {
  const days = Math.max(1, Math.round(D(input.months).times(30).toNumber()));
  const perDaySales = D(input.unitsToSell).div(days);
  const unitCostSold = D(input.uniquePerCopy).plus(input.printUnit);
  const netPrice = D(input.expectedNetPrice);
  const dfpc = D(input.dailyFixedPerCopy);

  let copies = D(input.startCopies);
  let cumRevenue = new Decimal(0);
  let cumCost = new Decimal(0);
  let breakEvenDay: number | null = null;

  for (let d = 1; d <= days; d++) {
    cumCost = cumCost.plus(copies.times(dfpc)); // fixed carrying on held copies
    const sold = Decimal.min(perDaySales, copies);
    cumRevenue = cumRevenue.plus(sold.times(netPrice));
    cumCost = cumCost.plus(sold.times(unitCostSold));
    copies = copies.minus(sold);
    if (breakEvenDay === null && cumRevenue.gte(cumCost)) breakEvenDay = d;
  }

  const fixedLoadPerCopy = dfpc.times(days);
  const finalUnitCost = D(input.uniquePerCopy).plus(input.printUnit).plus(fixedLoadPerCopy);
  return { finalUnitCost, profit: cumRevenue.minus(cumCost), breakEvenDay, days };
}
