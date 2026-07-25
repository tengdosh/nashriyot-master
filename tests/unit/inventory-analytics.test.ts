import { describe, it, expect } from "vitest";
import {
  mean,
  stdDev,
  dailySeries,
  demandStats,
  ropCheck,
  abcClassify,
  serviceLevelZFor,
  turnoverRatio,
  isValuableBacklist,
  hasSeasonalPattern,
  ageDiscountFor,
  suggestDisposal,
  assessDeadStock,
  stockStatus,
  availableQty,
  DISPOSAL_LADDER,
  InventoryAnalyticsError,
  type DemandStats,
} from "@/lib/inventory-analytics";

const NOW = new Date("2026-07-25T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("demand statistics", () => {
  it("mean and σ over a series; empty series → 0", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
    expect(stdDev([2, 4, 6])).toBeCloseTo(1.632993, 5);
    expect(stdDev([])).toBe(0);
    expect(stdDev([5, 5, 5])).toBe(0);
  });

  it("dailySeries buckets by day and counts zero-sale days", () => {
    const s = dailySeries([{ date: days(0), qty: 3 }, { date: days(0), qty: 2 }, { date: days(4), qty: 10 }], 5, NOW);
    expect(s).toEqual([10, 0, 0, 0, 5]); // oldest first, today last
    expect(s).toHaveLength(5);
  });

  it("dailySeries drops sales outside the window (both directions)", () => {
    const s = dailySeries(
      [
        { date: days(-2), qty: 99 }, // future-dated → ignored
        { date: days(90), qty: 99 }, // older than the window → ignored
        { date: days(1), qty: 7 },
      ],
      5,
      NOW,
    );
    expect(s.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("dailySeries rejects a non-positive window", () => {
    expect(() => dailySeries([], 0, NOW)).toThrow(InventoryAnalyticsError);
  });

  it("demandStats annualises the daily average", () => {
    const st = demandStats([2, 2, 2, 2], 4);
    expect(st.dailyAvg).toBe(2);
    expect(st.sigma).toBe(0);
    expect(st.annualDemand).toBe(730);
    expect(st.windowDays).toBe(4);
  });
});

describe("ROP / EOQ (v1 §6.3)", () => {
  const stats: DemandStats = { dailyAvg: 10, sigma: 4, annualDemand: 3650, windowDays: 90 };
  const base = {
    stats,
    leadTimeDays: 25,
    serviceLevelZ: 1.65,
    unitCost: 40_000,
    carryingRate: 0.2,
    orderCost: 500_000,
  };

  it("SS = Z·σ·√L and ROP = dAvg·L + SS", () => {
    const r = ropCheck({ ...base, available: 1000 });
    // 1.65 × 4 × √25 = 33 ; ROP = 10×25 + 33 = 283
    expect(r.ss.toNumber()).toBeCloseTo(33, 6);
    expect(r.rop.toNumber()).toBeCloseTo(283, 6);
    expect(r.isManual).toBe(false);
    expect(r.needsReorder).toBe(false);
    expect(r.suggestQty).toBe(0);
  });

  it("available below ROP → reorder with EOQ quantity", () => {
    const r = ropCheck({ ...base, available: 100 });
    // H = 40 000 × 0.2 = 8 000 ; EOQ = √(2×3650×500 000 / 8 000) = √456 250 ≈ 675.5
    expect(r.needsReorder).toBe(true);
    expect(r.eoq.toNumber()).toBeCloseTo(675.4628, 3);
    expect(r.suggestQty).toBe(676); // rounded UP — never order short
  });

  it("manualROP overrides the computed point", () => {
    const r = ropCheck({ ...base, available: 400, manualROP: 500 });
    expect(r.isManual).toBe(true);
    expect(r.rop.toNumber()).toBe(500);
    expect(r.needsReorder).toBe(true);
  });

  it("zero holding cost falls back to annual demand instead of dividing by zero", () => {
    const r = ropCheck({ ...base, available: 0, unitCost: 0, carryingRate: 0.2, manualROP: null });
    expect(r.eoq.toNumber()).toBe(3650);
    expect(r.suggestQty).toBe(3650);
  });

  it("rejects a non-positive lead time", () => {
    expect(() => ropCheck({ ...base, available: 0, leadTimeDays: 0 })).toThrow(InventoryAnalyticsError);
  });
});

describe("ABC classification (cumulative 80/15/5)", () => {
  it("assigns A/B/C by where each SKU starts in the cumulative curve", () => {
    const rows = abcClassify([
      { item: "c", revenue: 30 },
      { item: "a", revenue: 500 },
      { item: "b", revenue: 400 },
      { item: "d", revenue: 70 },
    ]);
    expect(rows.map((r) => r.item)).toEqual(["a", "b", "d", "c"]); // sorted DESC
    // total 1000 → a 50% (starts 0), b 40% (starts 50%), d 7% (starts 90%), c 3% (starts 97%)
    expect(rows.map((r) => r.abcClass)).toEqual(["A", "A", "B", "C"]);
    expect(rows[0].share.toNumber()).toBe(0.5);
    expect(rows[3].cumulative.toNumber()).toBe(1);
  });

  it("a single dominant SKU is still A even though it alone exceeds 80%", () => {
    const rows = abcClassify([{ item: "x", revenue: 1000 }, { item: "y", revenue: 1 }]);
    expect(rows[0].abcClass).toBe("A");
    expect(rows[1].abcClass).toBe("C");
  });

  it("zero total revenue → everything is C with no shares", () => {
    const rows = abcClassify([{ item: "x", revenue: 0 }, { item: "y", revenue: 0 }]);
    expect(rows.map((r) => r.abcClass)).toEqual(["C", "C"]);
    expect(rows[0].share.toNumber()).toBe(0);
    expect(rows[0].cumulative.toNumber()).toBe(0);
  });

  it("service level rises with ABC class", () => {
    expect(serviceLevelZFor("A").toNumber()).toBe(2.33);
    expect(serviceLevelZFor("B").toNumber()).toBe(1.65);
    expect(serviceLevelZFor("C").toNumber()).toBe(1.28);
  });
});

describe("valuable-backlist guard (v1 §6.2)", () => {
  it("turnover ratio; zero average stock never divides", () => {
    expect(turnoverRatio({ unitsSold: 600, avgQoh: 200 }).toNumber()).toBe(3);
    expect(turnoverRatio({ unitsSold: 600, avgQoh: 0 }).toNumber()).toBe(0);
  });

  it("needs positive CM12 first — a loss-making slow title is disposable", () => {
    expect(
      isValuableBacklist({ cm12: -1, turnover: 99, minTurnover: 0.5, hasSeasonalPattern: true }),
    ).toBe(false);
  });

  it("profitable AND (seasonal OR turning over) → protected", () => {
    expect(isValuableBacklist({ cm12: 1, turnover: 0.1, minTurnover: 0.5, hasSeasonalPattern: true })).toBe(true);
    expect(isValuableBacklist({ cm12: 1, turnover: 2, minTurnover: 0.5, hasSeasonalPattern: false })).toBe(true);
    expect(isValuableBacklist({ cm12: 1, turnover: 0.1, minTurnover: 0.5, hasSeasonalPattern: false })).toBe(false);
  });

  it("seasonality needs 12 buckets, real sales, and a genuine spike", () => {
    expect(hasSeasonalPattern([1, 2, 3])).toBe(false); // too few buckets
    expect(hasSeasonalPattern(new Array(12).fill(0))).toBe(false); // no sales at all
    const flat = new Array(12).fill(10);
    expect(hasSeasonalPattern(flat)).toBe(false);
    const septemberSpike = [5, 5, 5, 5, 5, 5, 5, 5, 90, 5, 5, 5];
    expect(hasSeasonalPattern(septemberSpike)).toBe(true);
    const onlyOneMonth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40];
    expect(hasSeasonalPattern(onlyOneMonth)).toBe(true);
  });
});

describe("age discount tiers", () => {
  const tiers = [
    { fromDays: 0, toDays: 90, discount: 0 },
    { fromDays: 91, toDays: 180, discount: 0.15 },
    { fromDays: 181, toDays: null, discount: 0.3 },
  ];

  it("picks the containing tier, including the open-ended last one", () => {
    expect(ageDiscountFor(30, tiers).toNumber()).toBe(0);
    expect(ageDiscountFor(120, tiers).toNumber()).toBe(0.15);
    expect(ageDiscountFor(900, tiers).toNumber()).toBe(0.3);
  });

  it("no matching tier → no discount", () => {
    expect(ageDiscountFor(50, [{ fromDays: 100, toDays: 200, discount: 0.4 }]).toNumber()).toBe(0);
    expect(ageDiscountFor(50, []).toNumber()).toBe(0);
  });
});

describe("disposal ladder", () => {
  it("climbs one step per threshold span and caps at write-off", () => {
    expect(suggestDisposal(120, 120)).toBe("PRICE_CUT");
    expect(suggestDisposal(200, 120)).toBe("PRICE_CUT");
    expect(suggestDisposal(300, 120)).toBe("BUNDLE");
    expect(suggestDisposal(3000, 120)).toBe("WRITE_OFF");
    expect(DISPOSAL_LADDER).toHaveLength(6);
  });

  it("rejects a non-positive threshold", () => {
    expect(() => suggestDisposal(500, 0)).toThrow(InventoryAnalyticsError);
  });
});

describe("dead-stock assessment (v1 §6.2)", () => {
  const cfg = { thresholdDays: 120, carryingRate: 0.2, expectedROI: 0.25 };

  it("🏆 GOLDEN: 820 × 50 000 @ carrying 20% / ROI 25% → 59 450 000", () => {
    const a = assessDeadStock({
      qtyOnHand: 820,
      ageDays: 200,
      unitCost: 50_000,
      valuableBacklist: false,
      ...cfg,
    });
    expect(a.isDead).toBe(true);
    expect(a.reason).toBe("DEAD");
    expect(a.dead.toNumber()).toBe(41_000_000);
    expect(a.carrying.toNumber()).toBe(8_200_000);
    expect(a.opportunity.toNumber()).toBe(10_250_000);
    expect(a.total.toNumber()).toBe(59_450_000);
    expect(a.suggestedAction).toBe("PRICE_CUT");
    expect(a.suggestedDiscount.toNumber()).toBe(0); // no tiers passed
  });

  it("carries the age discount when tiers are supplied", () => {
    const a = assessDeadStock({
      qtyOnHand: 10,
      ageDays: 200,
      unitCost: 1000,
      valuableBacklist: false,
      ...cfg,
      ageDiscountTiers: [{ fromDays: 181, toDays: null, discount: 0.3 }],
    });
    expect(a.suggestedDiscount.toNumber()).toBe(0.3);
  });

  it("not dead: no stock, under threshold, or protected backlist — all zero loss", () => {
    const none = assessDeadStock({ qtyOnHand: 0, ageDays: 999, unitCost: 50_000, valuableBacklist: false, ...cfg });
    expect(none).toMatchObject({ isDead: false, reason: "NO_STOCK" });

    const young = assessDeadStock({ qtyOnHand: 500, ageDays: 30, unitCost: 50_000, valuableBacklist: false, ...cfg });
    expect(young).toMatchObject({ isDead: false, reason: "UNDER_THRESHOLD" });

    const backlist = assessDeadStock({ qtyOnHand: 500, ageDays: 999, unitCost: 50_000, valuableBacklist: true, ...cfg });
    expect(backlist).toMatchObject({ isDead: false, reason: "VALUABLE_BACKLIST" });
    for (const a of [none, young, backlist]) {
      expect(a.total.toNumber()).toBe(0);
      expect(a.suggestedAction).toBeNull();
      expect(a.suggestedDiscount.toNumber()).toBe(0);
    }
  });
});

describe("stock status badge", () => {
  it("out of stock beats everything; dead outranks ROP", () => {
    expect(stockStatus({ available: 0, rop: 100, isDead: true })).toBe("OUT_OF_STOCK");
    expect(stockStatus({ available: 50, rop: 100, isDead: true })).toBe("DEAD");
    expect(stockStatus({ available: 50, rop: 100, isDead: false })).toBe("BELOW_ROP");
    expect(stockStatus({ available: 500, rop: 100, isDead: false })).toBe("HEALTHY");
  });

  it("available = on hand − reserved, clamped at zero", () => {
    expect(availableQty(100, 30)).toBe(70);
    expect(availableQty(10, 50)).toBe(0);
  });
});
