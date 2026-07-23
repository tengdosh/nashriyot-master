import { describe, it, expect } from "vitest";
import { NAV_ITEMS, filterNav } from "@/lib/nav";

describe("nav — permission filtering (sidebar by role)", () => {
  it("director sees every module", () => {
    const directorPerms = NAV_ITEMS.map((i) => i.permission);
    expect(filterNav(NAV_ITEMS, directorPerms)).toHaveLength(NAV_ITEMS.length);
  });

  it("sales manager sees a strict subset (sales yes, admin/royalty no)", () => {
    const salesPerms = [
      "dashboard.read",
      "sales.read",
      "leads.read",
      "transfers.read",
      "inventory.read",
      "costing.read",
      "analytics.read",
    ];
    const nav = filterNav(NAV_ITEMS, salesPerms);
    expect(nav.length).toBeLessThan(NAV_ITEMS.length);
    expect(nav.some((i) => i.href === "/sales")).toBe(true);
    expect(nav.some((i) => i.href === "/admin")).toBe(false);
    expect(nav.some((i) => i.href === "/royalties")).toBe(false);
  });

  it("no permissions → empty nav", () => {
    expect(filterNav(NAV_ITEMS, [])).toHaveLength(0);
    expect(filterNav(NAV_ITEMS, undefined)).toHaveLength(0);
  });
});
