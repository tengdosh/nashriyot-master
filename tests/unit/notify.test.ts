import { describe, it, expect } from "vitest";
import { matchesSubscription, renderNotification, NOTIF_PERMISSION } from "@/lib/notify";

describe("matchesSubscription", () => {
  const subs = { daily: true, events: ["ROP", "AR_OVERDUE", "MYSTERY"] };

  it("requires the event to be opted-in", () => {
    expect(matchesSubscription("DEAD_STOCK", subs, ["reports.read", "inventory.read"])).toBe(false);
    expect(matchesSubscription("ROP", subs, ["reports.read", "inventory.read"])).toBe(true);
  });

  it("requires the base reports.read gate", () => {
    expect(matchesSubscription("ROP", subs, ["inventory.read"])).toBe(false);
  });

  it("requires the type-specific permission", () => {
    expect(matchesSubscription("AR_OVERDUE", subs, ["reports.read"])).toBe(false);
    expect(matchesSubscription("AR_OVERDUE", subs, ["reports.read", "finance.read"])).toBe(true);
  });

  it("an unknown opted-in type needs only the base gate", () => {
    expect(matchesSubscription("MYSTERY", subs, ["reports.read"])).toBe(true);
  });

  it("handles a missing/empty subscription", () => {
    expect(matchesSubscription("ROP", null, ["reports.read", "inventory.read"])).toBe(false);
    expect(matchesSubscription("ROP", { daily: true }, ["reports.read", "inventory.read"])).toBe(false);
    expect(matchesSubscription("ROP", { events: [] }, ["reports.read"])).toBe(false);
  });

  it("maps every notification type to a permission", () => {
    for (const perm of Object.values(NOTIF_PERMISSION)) expect(perm).toMatch(/\.\w+$/);
  });
});

describe("renderNotification", () => {
  it("renders title, body and link with a severity icon", () => {
    const out = renderNotification({
      type: "AR_OVERDUE",
      severity: "CRITICAL",
      title: "Muddati oʻtgan qarz",
      body: "Akmal: 2 000 000 soʻm",
      linkUrl: "/finance/receivables",
    });
    expect(out).toContain("🔴");
    expect(out).toContain("Muddati oʻtgan qarz");
    expect(out).toContain("Akmal");
    expect(out).toContain("🔗 /finance/receivables");
  });

  it("renders a minimal notification and defaults an unknown severity icon", () => {
    const out = renderNotification({ type: "GENERAL", severity: "WEIRD", title: "Salom" });
    expect(out).toBe("ℹ️ *Salom*");
  });

  it("uses the warning icon", () => {
    expect(renderNotification({ type: "ROP", severity: "WARNING", title: "x" })).toContain("⚠️");
  });
});
