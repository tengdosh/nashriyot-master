import { describe, it, expect } from "vitest";
import {
  leadStaleness,
  campaignMetrics,
  campaignTotals,
  STALE_WARN_HOURS,
  STALE_HOURS,
} from "@/lib/leads";

const NOW = new Date("2026-07-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("leadStaleness", () => {
  it("open lead: OK < 24h, WARN 24–48h, STALE >= 48h", () => {
    expect(leadStaleness(hoursAgo(10), NOW, true)).toBe("OK");
    expect(leadStaleness(hoursAgo(24), NOW, true)).toBe("WARN");
    expect(leadStaleness(hoursAgo(47), NOW, true)).toBe("WARN");
    expect(leadStaleness(hoursAgo(48), NOW, true)).toBe("STALE");
    expect(leadStaleness(hoursAgo(200), NOW, true)).toBe("STALE");
  });
  it("closed leads are never stale", () => {
    expect(leadStaleness(hoursAgo(500), NOW, false)).toBe("OK");
  });
  it("thresholds are 24 and 48 hours", () => {
    expect(STALE_WARN_HOURS).toBe(24);
    expect(STALE_HOURS).toBe(48);
  });
});

describe("campaignMetrics", () => {
  it("computes conversion, CAC, ROI and revenue-per-lead", () => {
    const m = campaignMetrics({ campaign: "instagram-iyul", leads: 100, converted: 20, revenue: 10_000_000, cost: 2_000_000 });
    expect(m.conversionRate.toNumber()).toBe(0.2);
    expect(m.cac!.toNumber()).toBe(100_000); // 2m / 20
    expect(m.roi!.toNumber()).toBe(4); // (10m − 2m) / 2m
    expect(m.revenuePerLead.toNumber()).toBe(100_000);
  });

  it("no conversions → CAC null, conversion 0", () => {
    const m = campaignMetrics({ campaign: "x", leads: 50, converted: 0, revenue: 0, cost: 500_000 });
    expect(m.conversionRate.toNumber()).toBe(0);
    expect(m.cac).toBeNull();
    expect(m.roi!.toNumber()).toBe(-1); // spent, earned nothing
  });

  it("no spend → ROI null (undefined return)", () => {
    const m = campaignMetrics({ campaign: "organic", leads: 30, converted: 10, revenue: 5_000_000, cost: 0 });
    expect(m.roi).toBeNull();
    expect(m.cac!.toNumber()).toBe(0);
  });

  it("no leads → zero ratios, never NaN", () => {
    const m = campaignMetrics({ campaign: "empty", leads: 0, converted: 0, revenue: 0, cost: 0 });
    expect(m.conversionRate.toNumber()).toBe(0);
    expect(m.revenuePerLead.toNumber()).toBe(0);
    expect(m.cac).toBeNull();
    expect(m.roi).toBeNull();
  });
});

describe("campaignTotals", () => {
  it("aggregates leads/converted/revenue/cost and derives blended conversion + ROI", () => {
    const rows = [
      campaignMetrics({ campaign: "a", leads: 100, converted: 20, revenue: 10_000_000, cost: 2_000_000 }),
      campaignMetrics({ campaign: "b", leads: 50, converted: 5, revenue: 2_000_000, cost: 1_000_000 }),
    ];
    const t = campaignTotals(rows);
    expect(t.leads).toBe(150);
    expect(t.converted).toBe(25);
    expect(t.revenue.toNumber()).toBe(12_000_000);
    expect(t.cost.toNumber()).toBe(3_000_000);
    expect(t.conversionRate.toNumber()).toBeCloseTo(0.1667, 4);
    expect(t.roi!.toNumber()).toBe(3); // (12m − 3m) / 3m
  });
  it("empty set → zeros and null ROI", () => {
    const t = campaignTotals([]);
    expect(t.leads).toBe(0);
    expect(t.conversionRate.toNumber()).toBe(0);
    expect(t.roi).toBeNull();
  });
});
