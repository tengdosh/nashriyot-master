import { describe, it, expect } from "vitest";
import {
  holdingPerDay,
  marginPct,
  daysUntilCross,
  breakEvenCrossSoon,
  linearTrend,
  CROSS_ALERT_DAYS,
  CostingError,
} from "@/lib/costing";

describe("holdingPerDay", () => {
  it("is printUnit × carryingRate ÷ 365", () => {
    // 40 000 × 0.2 / 365 ≈ 21.92
    expect(holdingPerDay(40_000, 0.2).toNumber()).toBeCloseTo(21.9178, 3);
    expect(holdingPerDay(0, 0.2).toNumber()).toBe(0);
  });
  it("rejects a negative carrying rate", () => {
    expect(() => holdingPerDay(100, -0.1)).toThrow(CostingError);
  });
});

describe("marginPct", () => {
  it("is (net − cost) / net", () => {
    expect(marginPct(100_000, 60_000).toNumber()).toBe(0.4);
    expect(marginPct(100_000, 120_000).toNumber()).toBe(-0.2); // loss shows negative
  });
  it("zero/negative net → 0, never NaN", () => {
    expect(marginPct(0, 50).toNumber()).toBe(0);
    expect(marginPct(-5, 50).toNumber()).toBe(0);
  });
});

describe("daysUntilCross (break-even point)", () => {
  it("rising reportCost meets falling expNet after the gap closes", () => {
    // gap 40 (100 vs 140), closing at 1 + 1 = 2/day → 20 days
    expect(daysUntilCross(100, 1, 140, -1)).toBe(20);
  });
  it("already crossed (report ≥ net) → 0", () => {
    expect(daysUntilCross(150, 1, 140, -1)).toBe(0);
    expect(daysUntilCross(140, 0, 140, 0)).toBe(0);
  });
  it("parallel or diverging lines never cross → null", () => {
    expect(daysUntilCross(100, 0, 140, 0)).toBeNull(); // flat, gap never closes
    expect(daysUntilCross(100, 0, 140, 1)).toBeNull(); // net rising faster → diverge
  });
  it("a crossing beyond the horizon → null", () => {
    // gap 3650, closing at 0.5/day → 7300 days > 3650 horizon
    expect(daysUntilCross(0, 0.25, 3650, -0.25)).toBeNull();
    // but within a bigger horizon it resolves
    expect(daysUntilCross(0, 0.25, 3650, -0.25, 100000)).toBe(7300);
  });
  it("rounds up to whole days", () => {
    expect(daysUntilCross(100, 1, 105, 0)).toBe(5);
    expect(daysUntilCross(100, 1.1, 105, 0)).toBe(5); // 4.5 → 5
  });
});

describe("breakEvenCrossSoon", () => {
  it("true within the 30-day window, false beyond, false when null", () => {
    expect(CROSS_ALERT_DAYS).toBe(30);
    expect(breakEvenCrossSoon(20)).toBe(true);
    expect(breakEvenCrossSoon(30)).toBe(true);
    expect(breakEvenCrossSoon(31)).toBe(false);
    expect(breakEvenCrossSoon(null)).toBe(false);
    expect(breakEvenCrossSoon(10, 5)).toBe(false);
  });
});

describe("linearTrend", () => {
  it("fits a rising slope and reports the latest value", () => {
    const t = linearTrend([
      { day: 0, value: 100 },
      { day: 10, value: 110 },
      { day: 20, value: 120 },
    ]);
    expect(t.slopePerDay).toBeCloseTo(1, 6);
    expect(t.latest).toBeCloseTo(120, 6);
  });
  it("empty → flat zero; single point → that value, zero slope", () => {
    expect(linearTrend([])).toEqual({ latest: 0, slopePerDay: 0 });
    expect(linearTrend([{ day: 5, value: 42 }])).toEqual({ latest: 42, slopePerDay: 0 });
  });
  it("identical x-values degrade to zero slope instead of dividing by zero", () => {
    const t = linearTrend([
      { day: 3, value: 10 },
      { day: 3, value: 20 },
    ]);
    expect(t.slopePerDay).toBe(0);
  });
  it("captures a falling trend (expected-net decay)", () => {
    const t = linearTrend([
      { day: 0, value: 200 },
      { day: 30, value: 170 },
    ]);
    expect(t.slopePerDay).toBeCloseTo(-1, 6);
    expect(t.latest).toBeCloseTo(170, 6);
  });
});
