import { describe, it, expect } from "vitest";
import {
  WIDGET_CATALOG,
  GRID_COLS,
  MIN_W,
  isWidgetId,
  normalizeLayout,
  roleDefaultLayout,
  resolveVisibleWidgets,
  type WidgetLayout,
} from "@/lib/dashboard";

const ALL_PERMS = ["analytics.read", "sales.read", "production.read"];

describe("widget catalog", () => {
  it("every catalog widget has a positive default width within the grid", () => {
    expect(WIDGET_CATALOG.length).toBeGreaterThanOrEqual(7);
    for (const w of WIDGET_CATALOG) {
      expect(w.defaultW).toBeGreaterThanOrEqual(MIN_W);
      expect(w.defaultW).toBeLessThanOrEqual(GRID_COLS);
    }
  });
  it("isWidgetId recognises catalog ids only", () => {
    expect(isWidgetId("kpi")).toBe(true);
    expect(isWidgetId("bogus")).toBe(false);
  });
});

describe("normalizeLayout", () => {
  it("appends catalog widgets a stored layout has never seen", () => {
    const norm = normalizeLayout([{ id: "kpi", w: 12 }]);
    expect(norm[0].id).toBe("kpi");
    // Every other catalog widget is appended after it.
    expect(norm).toHaveLength(WIDGET_CATALOG.length);
    expect(new Set(norm.map((w) => w.id)).size).toBe(WIDGET_CATALOG.length);
  });

  it("drops unknown ids and duplicates (first wins)", () => {
    const norm = normalizeLayout([
      { id: "kpi", w: 12 },
      { id: "gone", w: 6 },
      { id: "kpi", w: 4 }, // duplicate
    ]);
    const kpis = norm.filter((w) => w.id === "kpi");
    expect(kpis).toHaveLength(1);
    expect(kpis[0].w).toBe(12); // first occurrence kept
    expect(norm.some((w) => (w.id as string) === "gone")).toBe(false);
  });

  it("clamps widths and snaps missing/invalid ones to the default", () => {
    const norm = normalizeLayout([
      { id: "kpi", w: 99 }, // too wide → 12
      { id: "alerts", w: 1 }, // too narrow → MIN_W
      { id: "ar-mini", w: "x" }, // invalid → default (6)
    ]);
    expect(norm.find((w) => w.id === "kpi")!.w).toBe(GRID_COLS);
    expect(norm.find((w) => w.id === "alerts")!.w).toBe(MIN_W);
    expect(norm.find((w) => w.id === "ar-mini")!.w).toBe(6);
  });

  it("preserves the hidden flag and defaults it to false", () => {
    const norm = normalizeLayout([{ id: "kpi", w: 12, hidden: true }]);
    expect(norm.find((w) => w.id === "kpi")!.hidden).toBe(true);
    expect(norm.find((w) => w.id === "alerts")!.hidden).toBe(false);
  });

  it("garbage input yields the full default catalog", () => {
    expect(normalizeLayout(null)).toHaveLength(WIDGET_CATALOG.length);
    expect(normalizeLayout("nope")).toHaveLength(WIDGET_CATALOG.length);
    expect(normalizeLayout([1, "x", {}, { id: 5 }])).toHaveLength(WIDGET_CATALOG.length);
  });
});

describe("roleDefaultLayout", () => {
  it("puts role-relevant widgets first", () => {
    expect(roleDefaultLayout("SALES_MANAGER")[1].id).toBe("ar-mini");
    expect(roleDefaultLayout("PRODUCTION_MANAGER")[1].id).toBe("overdue-tasks");
    expect(roleDefaultLayout("ACCOUNTANT")[1].id).toBe("ar-mini");
    // Every role default still contains the whole catalog (order differs only).
    expect(roleDefaultLayout("SALES_MANAGER")).toHaveLength(WIDGET_CATALOG.length);
  });
  it("an unknown role gets the catalog order", () => {
    const d = roleDefaultLayout("DIRECTOR");
    expect(d.map((w) => w.id)).toEqual(WIDGET_CATALOG.map((w) => w.id));
  });
});

describe("resolveVisibleWidgets", () => {
  it("hides widgets the user lacks permission for", () => {
    const layout: WidgetLayout[] = normalizeLayout([]);
    const salesOnly = resolveVisibleWidgets(layout, ["sales.read"]);
    const ids = salesOnly.map((w) => w.id);
    expect(ids).toContain("kpi"); // no permission required
    expect(ids).toContain("ar-mini"); // sales.read
    expect(ids).toContain("channel-donut"); // sales.read
    expect(ids).not.toContain("monthly-revenue"); // needs analytics.read
    expect(ids).not.toContain("overdue-tasks"); // needs production.read
  });

  it("drops hidden widgets even when permitted", () => {
    const visible = resolveVisibleWidgets([{ id: "kpi", w: 12, hidden: true }], ALL_PERMS);
    expect(visible.some((w) => w.id === "kpi")).toBe(false);
  });

  it("attaches the catalog title and keeps only preference fields", () => {
    const visible = resolveVisibleWidgets([{ id: "kpi", w: 10 }], ALL_PERMS);
    const kpi = visible.find((w) => w.id === "kpi")!;
    expect(kpi.title).toBe("Asosiy koʻrsatkichlar");
    expect(kpi.w).toBe(10);
  });

  it("a user with all perms sees every widget", () => {
    expect(resolveVisibleWidgets(normalizeLayout([]), ALL_PERMS)).toHaveLength(WIDGET_CATALOG.length);
  });
});
