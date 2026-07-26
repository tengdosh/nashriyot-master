/**
 * Dashboard widget catalog and layout logic (spec v1 §5.9). Pure and
 * unit-tested: the service and UI both go through these so a stored layout can
 * never drift out of sync with the catalog (a removed widget disappears, a new
 * one appears, a corrupt width is clamped).
 */

export type WidgetId =
  | "kpi"
  | "monthly-revenue"
  | "alerts"
  | "top-titles"
  | "channel-donut"
  | "overdue-tasks"
  | "ar-mini";

export type WidgetDef = {
  id: WidgetId;
  title: string;
  /** Default column span on the 12-col grid. */
  defaultW: number;
  /** Permission required to see the widget; null = everyone with dashboard.read. */
  permission: string | null;
};

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: "kpi", title: "Asosiy koʻrsatkichlar", defaultW: 12, permission: null },
  { id: "monthly-revenue", title: "12 oylik tushum", defaultW: 8, permission: "analytics.read" },
  { id: "alerts", title: "Ogohlantirishlar", defaultW: 4, permission: null },
  { id: "top-titles", title: "Top-10 asar", defaultW: 6, permission: "analytics.read" },
  { id: "channel-donut", title: "Kanal ulushi", defaultW: 6, permission: "sales.read" },
  { id: "overdue-tasks", title: "Kechikkan vazifalar", defaultW: 6, permission: "production.read" },
  { id: "ar-mini", title: "Qarzlar (AR)", defaultW: 6, permission: "sales.read" },
];

const CATALOG_BY_ID = new Map(WIDGET_CATALOG.map((w) => [w.id, w]));

export const GRID_COLS = 12;
export const MIN_W = 3;

export type WidgetLayout = { id: WidgetId; w: number; hidden?: boolean };

export function isWidgetId(v: string): v is WidgetId {
  return CATALOG_BY_ID.has(v as WidgetId);
}

/** Clamp a width to the grid, snapping a missing/invalid value to the default. */
function clampWidth(w: unknown, def: number): number {
  const n = typeof w === "number" && Number.isFinite(w) ? Math.round(w) : def;
  return Math.min(Math.max(n, MIN_W), GRID_COLS);
}

/**
 * Reconcile a stored layout with the catalog:
 *  - drop entries whose widget no longer exists,
 *  - drop duplicates (first wins),
 *  - clamp widths,
 *  - append any catalog widget the layout has not seen yet (so a newly shipped
 *    widget shows up for existing users instead of staying invisible).
 */
export function normalizeLayout(stored: unknown): WidgetLayout[] {
  const arr = Array.isArray(stored) ? stored : [];
  const seen = new Set<WidgetId>();
  const out: WidgetLayout[] = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== "string" || !isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    const def = CATALOG_BY_ID.get(id)!;
    out.push({
      id,
      w: clampWidth((raw as { w?: unknown }).w, def.defaultW),
      hidden: (raw as { hidden?: unknown }).hidden === true,
    });
  }

  for (const def of WIDGET_CATALOG) {
    if (!seen.has(def.id)) out.push({ id: def.id, w: def.defaultW, hidden: false });
  }

  return out;
}

/**
 * Role default layout. DIRECTOR/ADMIN see everything; a role that lacks a
 * widget's permission simply won't have it rendered (resolveVisibleWidgets),
 * but the default order is still sensible per role.
 */
export function roleDefaultLayout(role: string): WidgetLayout[] {
  const full = WIDGET_CATALOG.map((w) => ({ id: w.id, w: w.defaultW }));
  switch (role) {
    case "SALES_MANAGER":
      return orderBy(full, ["kpi", "ar-mini", "channel-donut", "alerts", "top-titles", "monthly-revenue"]);
    case "PRODUCTION_MANAGER":
      return orderBy(full, ["kpi", "overdue-tasks", "alerts", "top-titles"]);
    case "ACCOUNTANT":
      return orderBy(full, ["kpi", "ar-mini", "monthly-revenue", "alerts"]);
    default:
      return full;
  }
}

function orderBy(layout: WidgetLayout[], order: WidgetId[]): WidgetLayout[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...layout].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

export type VisibleWidget = WidgetLayout & { title: string };

/**
 * The widgets to actually render: normalized, not hidden, and permitted for the
 * user. A permission the user lacks removes the widget regardless of the stored
 * layout — the layout is a preference, not an authorization.
 */
export function resolveVisibleWidgets(
  layout: WidgetLayout[],
  permissions: string[],
): VisibleWidget[] {
  const perms = new Set(permissions);
  return normalizeLayout(layout)
    .filter((w) => !w.hidden)
    .map((w) => ({ ...w, def: CATALOG_BY_ID.get(w.id)! }))
    .filter(({ def }) => def.permission == null || perms.has(def.permission))
    .map(({ def, ...w }) => ({ ...w, title: def.title }));
}
