import { describe, it, expect } from "vitest";
import {
  demandAt,
  suggestPrice,
  forecastConfidence,
  forecastDemandTotal,
  AUTO_APPLY_MAPE_LIMIT,
  PricingError,
} from "@/lib/pricing";

describe("demandAt (constant elasticity)", () => {
  it("at the reference price demand equals the reference quantity", () => {
    expect(demandAt({ price: 100, elasticity: -1.2, refPrice: 100, refQty: 500 }).toNumber()).toBeCloseTo(500, 6);
  });
  it("elastic demand falls as price rises", () => {
    const d = demandAt({ price: 120, elasticity: -1.2, refPrice: 100, refQty: 500 });
    // 500 × 1.2^-1.2 ≈ 500 × 0.8035 ≈ 401.7
    expect(d.toNumber()).toBeCloseTo(401.7, 0);
    expect(d.lt(500)).toBe(true);
  });
  it("never returns negative demand and rejects a non-positive reference price", () => {
    expect(demandAt({ price: 1_000_000, elasticity: -3, refPrice: 100, refQty: 10 }).gte(0)).toBe(true);
    expect(() => demandAt({ price: 100, elasticity: -1, refPrice: 0, refQty: 10 })).toThrow(PricingError);
  });
});

describe("suggestPrice", () => {
  it("recommends a rise for inelastic demand (|e| < 1)", () => {
    // Inelastic: raising price increases revenue → optimum near the cap.
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 40_000, elasticity: -0.5 });
    expect(s.suggestedPrice.gt(s.currentPrice)).toBe(true);
    expect(s.changed).toBe(true);
    expect(s.uplift.gt(0)).toBe(true);
    expect(s.suggestedPrice.lte(130_000)).toBe(true); // capped at current × 1.3
    expect(s.rationale).toContain("oshirish");
  });

  it("never recommends below the floor even when the curve wants to", () => {
    // Very elastic: the revenue curve pushes price DOWN, but the floor holds.
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 95_000, elasticity: -3 });
    expect(s.suggestedPrice.gte(95_000)).toBe(true);
  });

  it("returns changed=false when the optimum is within 3% of the current price", () => {
    // Unit elasticity → revenue roughly flat → optimum ≈ current.
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 40_000, elasticity: -1 });
    expect(s.changed).toBe(false);
    expect(s.rationale).toContain("tavsiya etilmaydi");
  });

  it("honours an explicit contract cap", () => {
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 40_000, elasticity: -0.3, capPrice: 110_000 });
    expect(s.suggestedPrice.lte(110_000)).toBe(true);
  });

  it("a floor above the current price forces the suggestion up to the floor", () => {
    // lo = current, so the grid's sub-floor points are skipped and the result
    // is clamped to the floor (which is above today's price).
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 120_000, elasticity: -0.5 });
    expect(s.suggestedPrice.gte(120_000)).toBe(true);
    expect(s.changed).toBe(true);
  });

  it("a zero reference quantity yields zero uplift instead of dividing by zero", () => {
    const s = suggestPrice({ currentPrice: 100_000, floorPrice: 40_000, elasticity: -0.5, refQty: 0 });
    expect(s.uplift.toNumber()).toBe(0);
  });

  it("rejects a non-positive current price", () => {
    expect(() => suggestPrice({ currentPrice: 0, floorPrice: 1, elasticity: -1 })).toThrow(PricingError);
  });
});

describe("forecastConfidence (MAPE gate)", () => {
  it("MAPE over 40% is LOW confidence and blocks auto-apply", () => {
    const c = forecastConfidence(0.45);
    expect(c.level).toBe("LOW");
    expect(c.canAutoApply).toBe(false);
  });
  it("boundary: exactly 40% still allows apply, just over does not", () => {
    expect(forecastConfidence(AUTO_APPLY_MAPE_LIMIT).canAutoApply).toBe(true);
    expect(forecastConfidence(0.4001).canAutoApply).toBe(false);
  });
  it("tiers: <=20% HIGH, <=40% MEDIUM", () => {
    expect(forecastConfidence(0.1).level).toBe("HIGH");
    expect(forecastConfidence(0.2).level).toBe("HIGH");
    expect(forecastConfidence(0.3).level).toBe("MEDIUM");
  });
  it("a null MAPE is LOW, never HIGH (absence of evidence)", () => {
    expect(forecastConfidence(null).level).toBe("LOW");
    expect(forecastConfidence(undefined).canAutoApply).toBe(false);
  });
});

describe("forecastDemandTotal", () => {
  it("sums the horizon, flooring negatives and rounding", () => {
    expect(forecastDemandTotal([10.4, 20.6, 30])).toBe(61);
    expect(forecastDemandTotal([100, -5, 50])).toBe(150); // negative clamped
    expect(forecastDemandTotal([])).toBe(0);
  });
});
