import { describe, it, expect } from "vitest";
import { renderReport } from "@/lib/bot-format";

describe("renderReport — sales-summary", () => {
  it("renders a full payload with a known period, channels and top-5", () => {
    const out = renderReport(
      "sales-summary",
      {
        period: "month",
        net: 12_000_000,
        units: 340,
        cm: 5_000_000,
        orderCount: 42,
        channels: [{ name: "Asaxiy", net: 8_000_000 }],
        top5: [{ workTitle: "Kitob A", net: 4_000_000 }],
      },
      "2026-07-26T00:00:00Z",
    );
    expect(out).toContain("Sotuv xulosasi");
    expect(out).toContain("shu oy");
    expect(out).toContain("Asaxiy");
    expect(out).toContain("Kitob A");
    expect(out).toContain("📄 Manba");
    expect(out).toContain("26.07.2026");
  });

  it("falls back for an unknown period and tolerates missing arrays / wrong types", () => {
    // period as a number exercises the string type-guard's false branch
    const out = renderReport("sales-summary", { period: 999, net: "oops", channels: undefined });
    expect(out).toContain("Sotuv xulosasi");
    expect(out).toContain("Sof tushum: 0 so'm"); // net "oops" → 0 via the number guard
  });
});

describe("renderReport — inventory-status", () => {
  it("lists ROP items when present", () => {
    const out = renderReport("inventory-status", {
      totalValue: 9_000_000,
      skuCount: 12,
      ropCount: 1,
      rop: [{ workTitle: "Kitob B", available: 3, suggestQty: 50 }],
    });
    expect(out).toContain("ROP dan past");
    expect(out).toContain("Kitob B");
  });
  it("shows an all-clear when no ROP breaches", () => {
    const out = renderReport("inventory-status", { totalValue: 1, skuCount: 1, ropCount: 0, rop: [] });
    expect(out).toContain("ROP dan yuqori");
  });
});

describe("renderReport — dead-stock", () => {
  it("renders top losses", () => {
    const out = renderReport("dead-stock", {
      frozenCapital: 5_000_000,
      copies: 100,
      flagCount: 4,
      top10: [{ workTitle: "Kitob C", qtyOnHand: 20, totalLoss: 1_000_000 }],
    });
    expect(out).toContain("Muzlagan kapital");
    expect(out).toContain("Kitob C");
  });
  it("shows all-clear when empty", () => {
    const out = renderReport("dead-stock", { frozenCapital: 0, copies: 0, flagCount: 0, top10: [] });
    expect(out).toContain("O'lik zaxira yo'q");
  });
});

describe("renderReport — royalty-liability", () => {
  it("shows the latest period and pending runs", () => {
    const out = renderReport("royalty-liability", {
      latestPeriod: "2026-H1",
      latestStatus: "DRAFT",
      latestLiability: 3_000_000,
      pendingApprovalCount: 2,
      pendingApproval: [
        { period: "2026-H1", liability: 3_000_000, createdBy: "Direktor" },
        { period: "2026-H2", liability: 1_000_000, createdBy: null },
      ],
    });
    expect(out).toContain("2026-H1");
    expect(out).toContain("Tasdiq kutmoqda");
    expect(out).toContain("Direktor");
    expect(out).toContain("2026-H2");
  });
  it("handles no runs and no pending, and a null createdBy", () => {
    const out = renderReport("royalty-liability", {
      latestPeriod: null,
      latestLiability: 0,
      pendingApprovalCount: 0,
      pendingApproval: [],
    });
    expect(out).toContain("Hali hisob-kitob yo'q");
    expect(out).toContain("Tasdiq kutayotgan run yo'q");
  });
});

describe("renderReport — ar-aging", () => {
  it("renders buckets and over-limit partners", () => {
    const out = renderReport("ar-aging", {
      total: 10_000_000,
      overdue: 4_000_000,
      buckets: { CURRENT: 6e6, D0_30: 1e6, D31_60: 1e6, D61_90: 1e6, D90_PLUS: 1e6 },
      overLimitCount: 1,
      overLimit: [{ partner: "Akmal", outstanding: 2_000_000 }],
    });
    expect(out).toContain("aging");
    expect(out).toContain("Akmal");
    expect(out).toContain("Limitdan oshgan");
  });
  it("tolerates missing buckets and no over-limit", () => {
    const out = renderReport("ar-aging", { total: 0, overdue: 0, overLimitCount: 0, overLimit: [] });
    expect(out).toContain("Limitdan oshgan hamkor yo'q");
  });
});

describe("renderReport — top-titles", () => {
  it("formats revenue, units and cm metrics", () => {
    const rows = [{ workTitle: "K", revenue: 1e6, units: 10, cm: 5e5 }];
    expect(renderReport("top-titles", { metric: "revenue", rows })).toContain("tushum");
    expect(renderReport("top-titles", { metric: "units", rows })).toContain("nusxa");
    expect(renderReport("top-titles", { metric: "cm", rows })).toContain("CM");
  });
  it("handles empty rows and unknown metric", () => {
    const out = renderReport("top-titles", { metric: "weird", rows: [] });
    expect(out).toContain("ma'lumot yo'q");
    expect(out).toContain("weird");
  });
});

describe("renderReport — kpi-digest", () => {
  it("renders headline numbers with alert breakdown", () => {
    const out = renderReport("kpi-digest", {
      cash: 1e6, ar: 2e6, ap: 3e6, inventoryValue: 4e6, ropCount: 2, frozenCapital: 5e6,
      openAlerts: 3, alertsByType: [{ type: "ROP", count: 2 }],
    });
    expect(out).toContain("KPI daydjest");
    expect(out).toContain("ROP");
  });
  it("omits the breakdown when there are no alerts", () => {
    const out = renderReport("kpi-digest", {
      cash: 0, ar: 0, ap: 0, inventoryValue: 0, ropCount: 0, frozenCapital: 0, openAlerts: 0, alertsByType: [],
    });
    expect(out).toContain("Ochiq ogohlantirishlar: 0");
  });
});

describe("renderReport — costing-risk", () => {
  it("lists at-risk books with days, incl a null days", () => {
    const out = renderReport("costing-risk", {
      scanned: 10,
      atRiskCount: 2,
      atRisk: [
        { workTitle: "K1", daysUntilCross: 12 },
        { workTitle: "K2", daysUntilCross: null },
      ],
    });
    expect(out).toContain("Qaytmas nuqtaga");
    expect(out).toContain("12 kun");
    expect(out).toContain("K2: —");
  });
  it("shows all-clear when none at risk", () => {
    const out = renderReport("costing-risk", { scanned: 5, atRiskCount: 0, atRisk: [] });
    expect(out).toContain("Yaqin xavf yo'q");
  });
});

describe("renderReport — agents-kpi", () => {
  it("renders agent rows", () => {
    const out = renderReport("agents-kpi", {
      agents: [{ partner: "Akmal", salesNet: 5e6, dso: 20, returnRatePct: 3.5 }],
    });
    expect(out).toContain("Agent KPI");
    expect(out).toContain("Akmal");
    expect(out).toContain("DSO 20 kun");
  });
  it("handles no agents", () => {
    expect(renderReport("agents-kpi", { agents: [] })).toContain("agent yo'q");
  });
});

describe("source line", () => {
  it("uses the current date when generatedAt is omitted", () => {
    const out = renderReport("kpi-digest", { cash: 0, ar: 0, ap: 0, inventoryValue: 0, ropCount: 0, frozenCapital: 0, openAlerts: 0, alertsByType: [] });
    expect(out).toMatch(/📄 Manba: KPI · \d{2}\.\d{2}\.\d{4}/);
  });
});
