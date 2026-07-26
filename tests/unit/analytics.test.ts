import { describe, it, expect } from "vitest";
import {
  buildPivot,
  topN,
  bottomN,
  growthRate,
  mape,
  pnlRollup,
  isMeasure,
  isDimension,
  MEASURES,
  DIMENSIONS,
} from "@/lib/analytics";

describe("buildPivot", () => {
  it("cross-tabs rows × columns with row/column/grand totals", () => {
    const p = buildPivot({
      facts: [
        { row: "Kitob A", col: "2026-01", value: 100 },
        { row: "Kitob A", col: "2026-02", value: 50 },
        { row: "Kitob B", col: "2026-01", value: 200 },
      ],
      columns: ["2026-01", "2026-02"],
    });
    expect(p.columns).toEqual(["2026-01", "2026-02"]);
    // Sorted by row total DESC → B (200) before A (150).
    expect(p.rows.map((r) => r.key)).toEqual(["Kitob B", "Kitob A"]);
    expect(p.rows[0].total.toNumber()).toBe(200);
    expect(p.rows[1].cells["2026-02"].toNumber()).toBe(50);
    expect(p.columnTotals["2026-01"].toNumber()).toBe(300);
    expect(p.grandTotal.toNumber()).toBe(350);
  });

  it("sums duplicate row/col facts into one cell", () => {
    const p = buildPivot({
      facts: [
        { row: "A", col: "x", value: 10 },
        { row: "A", col: "x", value: 5 },
      ],
    });
    expect(p.rows[0].cells["x"].toNumber()).toBe(15);
  });

  it("collapses to a single measure column when no fact has a column key", () => {
    const p = buildPivot({
      facts: [
        { row: "A", value: 10 },
        { row: "B", value: 30 },
        { row: "A", value: 5 },
      ],
    });
    expect(p.columns).toEqual(["__total__"]);
    expect(p.rows.map((r) => r.key)).toEqual(["B", "A"]);
    expect(p.rows[1].total.toNumber()).toBe(15);
    expect(p.grandTotal.toNumber()).toBe(45);
  });

  it("keeps facts whose column is not in the supplied order, appended after it", () => {
    const p = buildPivot({
      facts: [
        { row: "A", col: "known", value: 1 },
        { row: "A", col: "surprise", value: 2 },
      ],
      columns: ["known"],
    });
    expect(p.columns).toEqual(["known", "surprise"]);
    expect(p.rows[0].total.toNumber()).toBe(3);
  });

  it("a null column falls back to the em-dash bucket when other facts have columns", () => {
    const p = buildPivot({
      facts: [
        { row: "A", col: "x", value: 1 },
        { row: "A", col: null, value: 2 },
      ],
    });
    expect(p.columns).toContain("—");
    expect(p.rows[0].cells["—"].toNumber()).toBe(2);
  });

  it("an empty fact set yields an empty pivot", () => {
    const p = buildPivot({ facts: [] });
    expect(p.rows).toEqual([]);
    expect(p.grandTotal.toNumber()).toBe(0);
  });
});

describe("ranking", () => {
  const items = [
    { item: "a", value: 30 },
    { item: "b", value: 10 },
    { item: "c", value: 50 },
    { item: "d", value: 20 },
  ];
  it("topN returns the largest, bottomN the smallest, both by measure", () => {
    expect(topN(items, 2).map((r) => r.item)).toEqual(["c", "a"]);
    expect(bottomN(items, 2).map((r) => r.item)).toEqual(["b", "d"]);
  });
  it("n larger than the list returns everything without error", () => {
    expect(topN(items, 99)).toHaveLength(4);
  });
  it("does not mutate the input array", () => {
    const copy = [...items];
    topN(items, 2);
    expect(items).toEqual(copy);
  });
});

describe("growthRate", () => {
  it("computes period-over-period growth as a ratio", () => {
    expect(growthRate(150, 100)!.toNumber()).toBe(0.5);
    expect(growthRate(80, 100)!.toNumber()).toBeCloseTo(-0.2, 10);
  });
  it("returns null when the base is zero (no meaningful growth)", () => {
    expect(growthRate(100, 0)).toBeNull();
  });
});

describe("mape (forecast accuracy)", () => {
  it("averages absolute percentage error over comparable months", () => {
    // |110-100|/100 = 0.10 ; |90-100|/100 = 0.10 → 0.10
    expect(mape([{ actual: 100, forecast: 110 }, { actual: 100, forecast: 90 }])!.toNumber()).toBeCloseTo(0.1, 10);
  });
  it("skips months with zero actual (percentage undefined)", () => {
    const m = mape([
      { actual: 0, forecast: 50 },
      { actual: 200, forecast: 180 },
    ]);
    expect(m!.toNumber()).toBeCloseTo(0.1, 10); // only the second pair counts
  });
  it("returns null when no month is comparable", () => {
    expect(mape([])).toBeNull();
    expect(mape([{ actual: 0, forecast: 5 }])).toBeNull();
  });
});

describe("pnlRollup (P&L by entity)", () => {
  it("computes gross/net profit and margins, plus a reconciling Jami row", () => {
    const { rows, total } = pnlRollup([
      { entityId: "ent-tasnim", entityName: "Tasnim", revenue: 1_000_000, cogs: 400_000, royalty: 100_000, fixedCosts: 200_000 },
      { entityId: "ent-sotuv", entityName: "Sotuv", revenue: 500_000, cogs: 300_000, royalty: 0, fixedCosts: 50_000 },
    ]);

    expect(rows[0].grossProfit.toNumber()).toBe(600_000);
    expect(rows[0].netProfit.toNumber()).toBe(300_000); // 600k − 100k − 200k
    expect(rows[0].grossMargin.toNumber()).toBe(0.6);
    expect(rows[0].netMargin.toNumber()).toBe(0.3);

    // Jami reconciles with the component rows.
    expect(total.entityName).toBe("Jami");
    expect(total.revenue.toNumber()).toBe(1_500_000);
    expect(total.cogs.toNumber()).toBe(700_000);
    expect(total.grossProfit.toNumber()).toBe(800_000);
    expect(total.netProfit.toNumber()).toBe(450_000); // 300k + 150k
    expect(total.netMargin.toNumber()).toBe(0.3); // 450k / 1.5m
  });

  it("🏆 GOLDEN (spec import etaloni): ~2.64 mlrd tushum → ~735 mln sof, ~27.8%", () => {
    const { total } = pnlRollup([
      {
        entityId: "all",
        entityName: "Nashriyot",
        revenue: 2_640_000_000,
        cogs: 1_500_000_000,
        royalty: 205_000_000,
        fixedCosts: 200_000_000,
      },
    ]);
    expect(total.netProfit.toNumber()).toBe(735_000_000);
    expect(total.netMargin.toNumber()).toBeCloseTo(0.2784, 3); // ≈ 27.8%
  });

  it("zero-revenue entity has zero margins, not NaN", () => {
    const { rows } = pnlRollup([
      { entityId: "x", entityName: "X", revenue: 0, cogs: 0, royalty: 0, fixedCosts: 100_000 },
    ]);
    expect(rows[0].netProfit.toNumber()).toBe(-100_000);
    expect(rows[0].grossMargin.toNumber()).toBe(0);
    expect(rows[0].netMargin.toNumber()).toBe(0);
  });

  it("an empty entity list still yields a zeroed Jami row", () => {
    const { rows, total } = pnlRollup([]);
    expect(rows).toEqual([]);
    expect(total.revenue.toNumber()).toBe(0);
    expect(total.netProfit.toNumber()).toBe(0);
    expect(total.netMargin.toNumber()).toBe(0);
  });
});

describe("constructor vocabulary", () => {
  it("guards recognise valid measures and dimensions only", () => {
    expect(isMeasure("revenue")).toBe(true);
    expect(isMeasure("bogus")).toBe(false);
    expect(isDimension("channel")).toBe(true);
    expect(isDimension("bogus")).toBe(false);
    expect(MEASURES.length).toBeGreaterThanOrEqual(4);
    expect(DIMENSIONS.length).toBeGreaterThanOrEqual(5);
  });
});
