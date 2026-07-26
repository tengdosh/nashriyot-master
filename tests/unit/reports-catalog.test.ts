import { describe, it, expect } from "vitest";
import {
  REPORT_NAMES,
  REPORT_CATALOG,
  REPORT_PARAM_SCHEMAS,
  isReportName,
  menuForPermissions,
  canRunReport,
  claudeTools,
  splitMessage,
} from "@/lib/reports-catalog";

describe("catalog integrity", () => {
  it("every name has a def, a param schema and a permission", () => {
    for (const n of REPORT_NAMES) {
      expect(REPORT_CATALOG[n].name).toBe(n);
      expect(REPORT_CATALOG[n].permission).toMatch(/\.\w+$/);
      expect(REPORT_CATALOG[n].menuIcon.length).toBeGreaterThan(0);
      expect(REPORT_PARAM_SCHEMAS[n]).toBeDefined();
    }
  });

  it("sales-summary defaults period to 30d and rejects unknown keys", () => {
    const s = REPORT_PARAM_SCHEMAS["sales-summary"];
    expect(s.parse({}).period).toBe("30d");
    expect(() => s.parse({ bogus: 1 })).toThrow();
    expect(s.parse({ period: "year", channelId: "c1" }).period).toBe("year");
  });

  it("top-titles defaults metric/n and bounds n", () => {
    const s = REPORT_PARAM_SCHEMAS["top-titles"];
    expect(s.parse({})).toEqual({ metric: "revenue", n: 5 });
    expect(() => s.parse({ n: 99 })).toThrow();
  });
});

describe("isReportName", () => {
  it("accepts known, rejects unknown", () => {
    expect(isReportName("dead-stock")).toBe(true);
    expect(isReportName("drop-table")).toBe(false);
  });
});

describe("menuForPermissions", () => {
  it("returns nothing without the reports.read base gate", () => {
    expect(menuForPermissions(["sales.read", "finance.read"])).toEqual([]);
  });

  it("filters to reports the user is permitted to see", () => {
    const menu = menuForPermissions(["reports.read", "sales.read", "finance.read"]);
    const names = menu.map((d) => d.name);
    expect(names).toContain("sales-summary"); // sales.read
    expect(names).toContain("ar-aging"); // finance.read
    expect(names).toContain("agents-kpi"); // finance.read
    expect(names).toContain("kpi-digest"); // reports.read itself
    expect(names).not.toContain("dead-stock"); // needs inventory.read
    expect(names).not.toContain("royalty-liability"); // needs royalty.read
  });

  it("a director-style superset sees all nine", () => {
    const all = [
      "reports.read", "sales.read", "inventory.read", "royalty.read",
      "finance.read", "analytics.read", "costing.read",
    ];
    expect(menuForPermissions(all).length).toBe(REPORT_NAMES.length);
  });
});

describe("canRunReport", () => {
  it("needs base gate AND the specific permission", () => {
    expect(canRunReport("dead-stock", ["reports.read", "inventory.read"])).toBe(true);
    expect(canRunReport("dead-stock", ["inventory.read"])).toBe(false); // no base gate
    expect(canRunReport("dead-stock", ["reports.read"])).toBe(false); // no specific
  });
});

describe("claudeTools", () => {
  it("exposes only permitted reports as tools with an input_schema", () => {
    const tools = claudeTools(["reports.read", "sales.read"]);
    expect(tools.map((t) => t.name)).toContain("sales-summary");
    expect(tools.every((t) => t.input_schema && typeof t.description === "string")).toBe(true);
    expect(claudeTools([])).toEqual([]);
  });
});

describe("splitMessage", () => {
  it("keeps a short message whole", () => {
    expect(splitMessage("hello")).toEqual(["hello"]);
  });

  it("splits on the last newline before the limit", () => {
    const text = "aaaa\nbbbb\ncccc";
    const parts = splitMessage(text, 6);
    expect(parts.every((p) => p.length <= 6)).toBe(true);
    expect(parts.join("\n")).toBe(text);
  });

  it("hard-splits when there is no newline to break on", () => {
    const text = "x".repeat(25);
    const parts = splitMessage(text, 10);
    expect(parts).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("drops an empty trailing remainder when the break consumes the rest", () => {
    const parts = splitMessage("x".repeat(10) + "\n", 10);
    expect(parts).toEqual(["x".repeat(10)]);
  });
});
