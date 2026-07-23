import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  printCost,
  totalCost,
  unitCost,
  minViablePrice,
  rrp,
  roundToPretty,
  breakEvenUnits,
  contributionMargin,
  deadStockLoss,
  safetyStock,
  reorderPoint,
  eoq,
  uniquePerCopy,
  dailyFixedPerCopy,
  reportCost,
  decisionCost,
  simulate,
  FinanceError,
} from "@/lib/finance";

const n = (d: Decimal) => d.toNumber();

// ── GOLDEN TEST (spec v1 §6.1) ────────────────────────────────────────────────
describe("finance — GOLDEN (v1 §6.1)", () => {
  const pc = printCost({ fixedPrintCost: 3000, pages: 384, perPageCost: 95 });
  const tc = totalCost({ fixedCosts: [12_000_000], printRun: 3000, pc });
  const uc = unitCost({ tc, printRun: 3000, sellThroughRate: 0.8 });
  const pmin = minViablePrice({ uc, discountRate: 0.45, royaltyRate: 0.1 });
  const retail = rrp({ uc, discountRate: 0.45, royaltyRate: 0.1, targetMargin: 0.2 });

  it("PC = 39 480", () => expect(n(pc)).toBe(39480));
  it("TC = 130 440 000", () => expect(n(tc)).toBe(130_440_000));
  it("UC = 54 350", () => expect(n(uc)).toBe(54350));
  it("P_min ≈ 120 778", () => {
    expect(pmin.toDecimalPlaces(2).toNumber()).toBe(120777.78);
    expect(pmin.round().toNumber()).toBe(120778);
  });
  it("RRP = 217 400", () => expect(n(retail)).toBe(217400));
});

// ── Boundary tests ────────────────────────────────────────────────────────────
describe("finance — boundaries", () => {
  it("unitCost: sellThrough = 0 throws", () => {
    expect(() => unitCost({ tc: 1, printRun: 1, sellThroughRate: 0 })).toThrow(FinanceError);
  });
  it("unitCost: sellThrough > 1 throws", () => {
    expect(() => unitCost({ tc: 1, printRun: 1, sellThroughRate: 1.5 })).toThrow(FinanceError);
  });
  it("minViablePrice: denom <= 0 throws", () => {
    expect(() => minViablePrice({ uc: 100, discountRate: 0.6, royaltyRate: 0.5 })).toThrow(FinanceError);
  });
  it("rrp: denom <= 0 throws", () => {
    expect(() => rrp({ uc: 100, discountRate: 0.5, royaltyRate: 0.3, targetMargin: 0.3 })).toThrow(
      FinanceError,
    );
  });
});

// ── breakEvenUnits + contributionMargin ──────────────────────────────────────
describe("finance — breakEven & CM", () => {
  it("breakEvenUnits: ceil(fixed / netPerUnit)", () => {
    // net = 200000*0.55 - 200000*0.10 - 39480 = 110000 - 20000 - 39480 = 50520
    // ceil(12,000,000 / 50520) = ceil(237.5) = 238
    const be = breakEvenUnits({
      fixedCosts: [12_000_000],
      price: 200000,
      discountRate: 0.45,
      royaltyRate: 0.1,
      pc: 39480,
    });
    expect(n(be)).toBe(238);
  });
  it("breakEvenUnits: netPerUnit <= 0 throws", () => {
    expect(() =>
      breakEvenUnits({ fixedCosts: [1], price: 1000, discountRate: 0.9, royaltyRate: 0.2, pc: 5000 }),
    ).toThrow(FinanceError);
  });
  it("contributionMargin: full inputs", () => {
    const cm = contributionMargin({
      unitPrice: 100000,
      discountRate: 0.4,
      channelFee: 5000,
      cogsUnit: 30000,
      royaltyEst: 5000,
      shippingPerUnit: 6000,
    });
    expect(n(cm)).toBe(14000);
  });
  it("contributionMargin: optional inputs default to 0", () => {
    const cm = contributionMargin({ unitPrice: 100000, discountRate: 0.4, cogsUnit: 30000 });
    expect(n(cm)).toBe(30000);
  });
});

// ── dead-stock (v1 §6.2 golden 59.45M) ────────────────────────────────────────
describe("finance — deadStockLoss", () => {
  it("820 × 50 000, carry 20%, ROI 25% → total ≈ 59 450 000", () => {
    const r = deadStockLoss({ qoh: 820, unitCost: 50000, carryingRate: 0.2, expectedROI: 0.25 });
    expect(n(r.dead)).toBe(41_000_000);
    expect(n(r.carrying)).toBe(8_200_000);
    expect(n(r.opportunity)).toBe(10_250_000);
    expect(n(r.total)).toBe(59_450_000);
  });
});

// ── ROP / SS / EOQ (v1 §6.3) ──────────────────────────────────────────────────
describe("finance — ROP/SS/EOQ", () => {
  it("safetyStock = Z*σ*√L", () => {
    expect(n(safetyStock({ z: 1.65, sigma: 10, leadTimeDays: 9 }))).toBe(49.5);
  });
  it("reorderPoint = dAvg*L + SS", () => {
    expect(n(reorderPoint({ dailyAvg: 20, leadTimeDays: 9, safetyStock: 49.5 }))).toBe(229.5);
  });
  it("eoq = √(2DS/H)", () => {
    expect(n(eoq({ annualDemand: 1200, orderCost: 50000, holdingCost: 6000 }))).toBeCloseTo(141.42, 2);
  });
  it("eoq: holdingCost <= 0 throws", () => {
    expect(() => eoq({ annualDemand: 1, orderCost: 1, holdingCost: 0 })).toThrow(FinanceError);
  });
});

// ── v2 §7.1 — live unit cost layers ───────────────────────────────────────────
describe("finance — v2 unit cost layers", () => {
  it("uniquePerCopy DROPS when a 2nd edition is added (ΣplannedRuns in denom)", () => {
    const oneEdition = uniquePerCopy({ titleCosts: [28_000_000], totalPlannedRuns: 5000 });
    const twoEditions = uniquePerCopy({ titleCosts: [28_000_000], totalPlannedRuns: 5000 + 7000 });
    expect(n(oneEdition)).toBe(5600);
    expect(twoEditions.lt(oneEdition)).toBe(true);
    expect(n(twoEditions)).toBeCloseTo(2333.33, 2);
  });
  it("uniquePerCopy: Σ plannedRuns = 0 throws", () => {
    expect(() => uniquePerCopy({ titleCosts: [1], totalPlannedRuns: 0 })).toThrow(FinanceError);
  });
  it("dailyFixedPerCopy = (fixedMonth/days)/max(copies,1)", () => {
    expect(n(dailyFixedPerCopy({ fixedMonth: 53_800_000, days: 31, totalCopies: 10000 }))).toBeCloseTo(
      173.548,
      2,
    );
  });
  it("dailyFixedPerCopy: totalCopies = 0 uses max(,1)", () => {
    const v = dailyFixedPerCopy({ fixedMonth: 3_100_000, days: 31, totalCopies: 0 });
    expect(n(v)).toBe(100000); // 3.1M / 31 / 1
  });
  it("dailyFixedPerCopy: days <= 0 throws", () => {
    expect(() => dailyFixedPerCopy({ fixedMonth: 1, days: 0, totalCopies: 1 })).toThrow(FinanceError);
  });
  it("decisionCost (sunk-free) < reportCost (full)", () => {
    const rc = reportCost({ uniquePerCopy: 5600, printUnit: 40000, allocFixedCum: 2000 });
    const dc = decisionCost({ printUnit: 40000, holdingPerDay: 200 });
    expect(n(rc)).toBe(47600);
    expect(n(dc)).toBe(40200);
    expect(dc.lt(rc)).toBe(true);
  });
});

// ── v2 §7.2 — simulator ───────────────────────────────────────────────────────
describe("finance — simulate", () => {
  it("profitable scenario: breaks even, positive profit, 180 days", () => {
    const r = simulate({
      months: 6,
      unitsToSell: 2400,
      startCopies: 3000,
      uniquePerCopy: 5600,
      printUnit: 40000,
      dailyFixedPerCopy: 100,
      expectedNetPrice: 120000,
    });
    expect(r.days).toBe(180);
    expect(r.breakEvenDay).not.toBeNull();
    expect(r.profit.gt(0)).toBe(true);
  });
  it("loss scenario: never breaks even (net price below cost)", () => {
    const r = simulate({
      months: 3,
      unitsToSell: 500,
      startCopies: 200,
      uniquePerCopy: 5600,
      printUnit: 40000,
      dailyFixedPerCopy: 100,
      expectedNetPrice: 10000,
    });
    expect(r.breakEvenDay).toBeNull();
    expect(r.profit.lt(0)).toBe(true);
  });
});

// ── roundToPretty rounding branch ─────────────────────────────────────────────
describe("finance — roundToPretty", () => {
  it("rounds to nearest 100 (half-up)", () => {
    expect(n(roundToPretty(217449))).toBe(217400);
    expect(n(roundToPretty(217450))).toBe(217500);
  });
});
