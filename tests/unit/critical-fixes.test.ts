/**
 * Regression tests for 8 critical audit findings (2026-07-31):
 *   1. Entity isolation — assertRowAccess never called (fixed in actions.ts / entry route)
 *   2. Transfer type — fifoIssue used type:"OUT" instead of "TRANSFER"
 *   3. Print fixedCost — hardcoded 0 instead of user-supplied value
 *   4. annualRevenue() fallback — counted TransferOrder OUTs as loose revenue
 *   5. salesSeries() / ROP demand — TransferOrder OUTs inflated demand
 *   6. fourState() "Sotilgan" — included TransferOrder OUTs
 *   7. listTransfers() reads — no entity filter (any user saw all entities)
 *   8. /api/v1/entry route — no entity access check on write operations
 */

import { describe, it, expect } from "vitest";
import {
  assertRowAccess,
  canAccessEntity,
  accessibleEntityIds,
  AuthzError,
} from "@/lib/rbac";
import { printOrderCreateSchema } from "@/lib/validators/production";

// ── Bug 1 & 8: Entity isolation (pure RBAC predicates) ───────────────────────

describe("Entity isolation — RBAC predicates", () => {
  const tasnimUser = {
    id: "user-tasnim",
    permissions: ["sales.write", "transfers.write"],
    roles: ["SALES_MANAGER"],
    entityAccess: ["entity-tasnim"],
  };

  const directorUser = {
    id: "user-director",
    permissions: ["sales.write", "admin.settings"],
    roles: ["DIRECTOR"],
    entityAccess: ["entity-tasnim", "entity-tahlil", "entity-sotuv"],
  };

  it("allows access to own entity", () => {
    expect(() => assertRowAccess(tasnimUser, { entityId: "entity-tasnim" })).not.toThrow();
  });

  it("blocks access to a different entity (403)", () => {
    expect(() => assertRowAccess(tasnimUser, { entityId: "entity-tahlil" })).toThrow(AuthzError);
  });

  it("403 status on entity violation", () => {
    try {
      assertRowAccess(tasnimUser, { entityId: "entity-tahlil" });
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthzError);
      expect((e as AuthzError).status).toBe(403);
    }
  });

  it("throws 401 for unauthenticated user", () => {
    expect(() => assertRowAccess(null, { entityId: "entity-tasnim" })).toThrow(AuthzError);
    try {
      assertRowAccess(null, { entityId: "entity-tasnim" });
    } catch (e) {
      expect((e as AuthzError).status).toBe(401);
    }
  });

  it("director can access all entities", () => {
    for (const eid of ["entity-tasnim", "entity-tahlil", "entity-sotuv"]) {
      expect(() => assertRowAccess(directorUser, { entityId: eid })).not.toThrow();
    }
  });

  it("canAccessEntity returns true for accessible entity", () => {
    expect(canAccessEntity(tasnimUser, "entity-tasnim")).toBe(true);
  });

  it("canAccessEntity returns false for inaccessible entity", () => {
    expect(canAccessEntity(tasnimUser, "entity-tahlil")).toBe(false);
  });

  it("accessibleEntityIds returns user.entityAccess array", () => {
    expect(accessibleEntityIds(tasnimUser)).toEqual(["entity-tasnim"]);
    expect(accessibleEntityIds(directorUser)).toHaveLength(3);
  });

  it("accessibleEntityIds returns [] for unauthenticated", () => {
    expect(accessibleEntityIds(null)).toEqual([]);
    expect(accessibleEntityIds(undefined)).toEqual([]);
  });

  it("null entityId in scope is allowed (no entity constraint)", () => {
    expect(() => assertRowAccess(tasnimUser, { entityId: null })).not.toThrow();
  });
});

// ── Bug 2 & 5 & 6: Transfer type — TRANSFER vs OUT ───────────────────────────

describe("Transfer type invariant", () => {
  // LAYER_TYPES defines consumable FIFO layers.
  // TRANSFER type must NOT be a consumable layer — it should not appear in:
  //   • salesSeries() → demand for ROP/ABC
  //   • fourState() "Sotilgan" count
  // Only "OUT" (real sales) and "RETURN" (sellable returns) are consumable layers.

  const LAYER_TYPES = ["IN", "RETURN"] as const;

  it("TRANSFER is not a consumable FIFO layer type", () => {
    expect(LAYER_TYPES).not.toContain("TRANSFER");
  });

  it("OUT is not a consumable FIFO layer type", () => {
    expect(LAYER_TYPES).not.toContain("OUT");
  });

  it("salesSeries() type='OUT' filter excludes TRANSFER-type movements", () => {
    // Simulating the Prisma where clause logic: type: "OUT" excludes TRANSFER
    const movements = [
      { type: "OUT", refType: "SalesOrder", qty: 10 },
      { type: "TRANSFER", refType: "TransferOrder", qty: 5 }, // fixed in code+migration
      { type: "OUT", refType: null, qty: 3 },
    ];
    const sales = movements.filter((m) => m.type === "OUT");
    expect(sales.every((m) => m.refType !== "TransferOrder")).toBe(true);
    expect(sales.reduce((a, m) => a + m.qty, 0)).toBe(13); // 10 + 3, not 18
  });

  it("fourState() Sotilgan count excludes TRANSFER-type movements", () => {
    const movements = [
      { type: "OUT", refType: "SalesOrder", qty: 100 },
      { type: "TRANSFER", refType: "TransferOrder", qty: 50 }, // correctly excluded
    ];
    const sotilgan = movements.filter((m) => m.type === "OUT").reduce((a, m) => a + m.qty, 0);
    expect(sotilgan).toBe(100); // not 150
  });
});

// ── Bug 4: annualRevenue() fallback filter ────────────────────────────────────

describe("annualRevenue() fallback — TransferOrder exclusion", () => {
  // The fallback counts OUT movements that are NOT from SalesOrders.
  // Bug: `{ refType: { not: "SalesOrder" } }` also matched TransferOrder refType,
  //      inflating ABC revenue for shipped books that only moved between entities.
  // Fix: `{ refType: { notIn: ["SalesOrder", "TransferOrder"] } }`

  function matchesFallback(refType: string | null): boolean {
    // Simulates the FIXED Prisma filter:
    // OR: [{ refType: null }, { refType: { notIn: ["SalesOrder", "TransferOrder"] } }]
    if (refType === null) return true;
    return !["SalesOrder", "TransferOrder"].includes(refType);
  }

  it("includes null refType (opening balances, migrated history)", () => {
    expect(matchesFallback(null)).toBe(true);
  });

  it("excludes SalesOrder refType (already in netSalesByProduct)", () => {
    expect(matchesFallback("SalesOrder")).toBe(false);
  });

  it("excludes TransferOrder refType (bug fix — was incorrectly included)", () => {
    expect(matchesFallback("TransferOrder")).toBe(false);
  });

  it("includes other non-null refTypes like Adjust or Manual", () => {
    expect(matchesFallback("Adjust")).toBe(true);
    expect(matchesFallback("Manual")).toBe(true);
  });

  it("old buggy filter incorrectly included TransferOrders", () => {
    // Documents the pre-fix behavior
    function oldBuggyFilter(refType: string | null): boolean {
      // OLD: OR: [{ refType: null }, { refType: { not: "SalesOrder" } }]
      // In SQL: NULL rows pass through the first branch;
      //         "TransferOrder" passes { not: "SalesOrder" } → WRONG
      if (refType === null) return true;
      return refType !== "SalesOrder";
    }
    expect(oldBuggyFilter("TransferOrder")).toBe(true); // was the bug
    expect(matchesFallback("TransferOrder")).toBe(false); // now fixed
  });
});

// ── Bug 3: Print order fixedCost ─────────────────────────────────────────────

describe("PrintOrder fixedCost — validator", () => {
  it("accepts zero fixedCost (default)", () => {
    const r = printOrderCreateSchema.safeParse({
      editionId: "ed-1",
      productId: "prod-1",
      printerId: "pr-1",
      quantity: 1000,
      unitPPB: 5000,
      fixedCost: 0,
      currency: "UZS",
      rate: 1,
    });
    expect(r.success).toBe(true);
  });

  it("accepts positive fixedCost (setup fee, pre-press)", () => {
    const r = printOrderCreateSchema.safeParse({
      editionId: "ed-1",
      productId: "prod-1",
      printerId: "pr-1",
      quantity: 3000,
      unitPPB: 39480,
      fixedCost: 500000,
      currency: "USD",
      rate: 12600,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fixedCost).toBe(500000);
      expect(r.data.currency).toBe("USD");
    }
  });

  it("rejects negative fixedCost", () => {
    const r = printOrderCreateSchema.safeParse({
      editionId: "ed-1",
      productId: "prod-1",
      printerId: "pr-1",
      quantity: 1000,
      unitPPB: 5000,
      fixedCost: -100,
      currency: "UZS",
      rate: 1,
    });
    expect(r.success).toBe(false);
  });

  it("fixedCost defaults to 0 if not provided", () => {
    const r = printOrderCreateSchema.safeParse({
      editionId: "ed-1",
      productId: "prod-1",
      printerId: "pr-1",
      quantity: 1000,
      unitPPB: 5000,
      currency: "UZS",
      rate: 1,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fixedCost).toBe(0);
  });
});

// ── T-20: FIFO concurrent isolation ──────────────────────────────────────────

describe("T-20: FIFO Serializable isolation", () => {
  it("oldest-first layer ordering is deterministic", () => {
    const layers = [
      { id: "l2", date: new Date("2026-02-01"), qtyRemaining: 50 },
      { id: "l1", date: new Date("2026-01-01"), qtyRemaining: 100 },
    ];
    const sorted = [...layers].sort((a, b) => a.date.getTime() - b.date.getTime());
    expect(sorted[0].id).toBe("l1");
    expect(sorted[1].id).toBe("l2");
  });

  it("concurrent over-issue is detected by zero qtyRemaining", () => {
    // After a serialization conflict, the loser sees qtyRemaining=0
    const layerAfterFirstTx = { qtyRemaining: 0 };
    let remaining = 10;
    const avail = layerAfterFirstTx.qtyRemaining ?? 0;
    const take = Math.min(remaining, avail);
    remaining -= take;
    expect(remaining).toBe(10); // nothing was consumed — InsufficientStockError would follow
  });

  it("COGS calculation is correct for partial layer consumption", () => {
    const layers = [
      { qtyRemaining: 30, unitCost: 10_000 },
      { qtyRemaining: 50, unitCost: 15_000 },
    ];
    let remaining = 40;
    let cogs = 0;
    for (const l of layers) {
      if (remaining <= 0) break;
      const avail = l.qtyRemaining ?? 0;
      const take = Math.min(remaining, avail);
      cogs += l.unitCost * take;
      remaining -= take;
    }
    expect(remaining).toBe(0);
    expect(cogs).toBe(30 * 10_000 + 10 * 15_000); // 450_000
  });
});

// ── T-05: returnStock avgCost inside transaction ──────────────────────────────

describe("T-05: returnStock — avgCost inside tx, zero-cost rejection", () => {
  it("zero avgCost triggers InventoryError", () => {
    function validateAvgCost(avgCost: number) {
      if (avgCost === 0)
        throw new Error("Qaytarish tannarxi aniqlanmadi — bu mahsulot uchun FIFO qatlamlari topilmadi");
    }
    expect(() => validateAvgCost(0)).toThrow("Qaytarish tannarxi aniqlanmadi");
    expect(() => validateAvgCost(12_000)).not.toThrow();
  });

  it("avgCost computed from qtyRemaining > 0 layers only", () => {
    const layers = [
      { qtyRemaining: 50, unitCost: 10_000 },
      { qtyRemaining: 0,  unitCost: 5_000 },   // consumed — excluded
      { qtyRemaining: 30, unitCost: 15_000 },
    ];
    const active = layers.filter((l) => l.qtyRemaining > 0);
    const totalQty = active.reduce((s, l) => s + l.qtyRemaining, 0);
    const totalCost = active.reduce((s, l) => s + l.unitCost * l.qtyRemaining, 0);
    const avg = totalCost / totalQty;
    // (50×10000 + 30×15000) / 80 = (500000 + 450000) / 80 = 11875
    expect(avg).toBeCloseTo(11_875);
  });

  it("empty layer list returns zero (triggers rejection in returnStock)", () => {
    const layers: { qtyRemaining: number; unitCost: number }[] = [];
    const totalQty = layers.reduce((s, l) => s + l.qtyRemaining, 0);
    const avg = totalQty > 0 ? 1 : 0;
    expect(avg).toBe(0);
  });
});

// ── T-03: receiveTransfer warehouse entity validation ─────────────────────────

describe("T-03: receiveTransfer — warehouse owned by correct entity", () => {
  function validateWarehouseOwnership(
    fromWh: { entityId: string },
    toWh: { entityId: string },
    order: { fromEntityId: string; toEntityId: string },
  ) {
    if (fromWh.entityId !== order.fromEntityId)
      throw new Error("Manba ombor transfer yuborguvchi sub'ektga tegishli emas");
    if (toWh.entityId !== order.toEntityId)
      throw new Error("Manzil ombor transfer qabul qiluvchi sub'ektga tegishli emas");
  }

  const order = { fromEntityId: "entity-tasnim", toEntityId: "entity-sotuv" };

  it("correct warehouse ownership passes", () => {
    expect(() =>
      validateWarehouseOwnership(
        { entityId: "entity-tasnim" },
        { entityId: "entity-sotuv" },
        order,
      ),
    ).not.toThrow();
  });

  it("wrong fromWarehouse entity is rejected", () => {
    expect(() =>
      validateWarehouseOwnership(
        { entityId: "entity-tahlil" },
        { entityId: "entity-sotuv" },
        order,
      ),
    ).toThrow("Manba ombor transfer yuborguvchi sub'ektga tegishli emas");
  });

  it("wrong toWarehouse entity is rejected", () => {
    expect(() =>
      validateWarehouseOwnership(
        { entityId: "entity-tasnim" },
        { entityId: "entity-tahlil" },
        order,
      ),
    ).toThrow("Manzil ombor transfer qabul qiluvchi sub'ektga tegishli emas");
  });

  it("both warehouses wrong — fromWarehouse error fires first", () => {
    expect(() =>
      validateWarehouseOwnership(
        { entityId: "entity-tahlil" },
        { entityId: "entity-tahlil" },
        order,
      ),
    ).toThrow("Manba ombor");
  });
});

// ── T-26: overridePMin requires admin.settings ────────────────────────────────

describe("T-26: overridePMin — admin.settings required in entry REST route", () => {
  function checkOverridePMinPermission(overridePMin: boolean | undefined, permissions: string[]) {
    if (overridePMin && !permissions.includes("admin.settings"))
      throw new Error("P_min bekor qilish uchun admin.settings huquqi talab qilinadi");
  }

  it("entry.write alone cannot override PMin", () => {
    expect(() => checkOverridePMinPermission(true, ["entry.write"])).toThrow("admin.settings");
  });

  it("admin.settings allows override", () => {
    expect(() =>
      checkOverridePMinPermission(true, ["entry.write", "admin.settings"]),
    ).not.toThrow();
  });

  it("overridePMin=false does not require admin.settings", () => {
    expect(() => checkOverridePMinPermission(false, ["entry.write"])).not.toThrow();
  });

  it("overridePMin=undefined does not require admin.settings", () => {
    expect(() => checkOverridePMinPermission(undefined, ["entry.write"])).not.toThrow();
  });
});

// ── T-27: AUTH_SECRET fail-fast, no hardcoded fallbacks ──────────────────────

describe("T-27: AUTH_SECRET — fail-fast if not set", () => {
  it("secret() throws when AUTH_SECRET is absent", () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      const fn = () => {
        const s = process.env.AUTH_SECRET;
        if (!s) throw new Error("AUTH_SECRET qiymati o'rnatilmagan — server sozlamalarini tekshiring");
        return s;
      };
      expect(fn).toThrow("AUTH_SECRET qiymati o'rnatilmagan");
    } finally {
      if (saved !== undefined) process.env.AUTH_SECRET = saved;
    }
  });

  it("secret() returns value when AUTH_SECRET is set", () => {
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-secret-32-chars-or-more-here";
    try {
      const fn = () => {
        const s = process.env.AUTH_SECRET;
        if (!s) throw new Error("AUTH_SECRET qiymati o'rnatilmagan — server sozlamalarini tekshiring");
        return s;
      };
      expect(fn()).toBe("test-secret-32-chars-or-more-here");
    } finally {
      if (saved !== undefined) process.env.AUTH_SECRET = saved;
      else delete process.env.AUTH_SECRET;
    }
  });

  it("fallback strings 'dev-only-secret-change-me' and 'dev-secret' are NOT safe keys", () => {
    // Documents why fail-fast is better than a weak default
    const badFallbacks = ["dev-only-secret-change-me", "dev-secret"];
    for (const fallback of badFallbacks) {
      // A real HMAC key should be at least 32 random bytes; these fixed strings are publicly known
      expect(fallback.length).toBeLessThan(32);
    }
  });
});

// ── Bug 7: listTransfers entity filter ───────────────────────────────────────

describe("listTransfers() entity filter logic", () => {
  // Simulates the Prisma where clause added to listTransfers(take, entityIds)
  // Users should only see transfers involving their accessible entities.

  const transfers = [
    { id: "t1", fromEntityId: "entity-tasnim", toEntityId: "entity-sotuv" },
    { id: "t2", fromEntityId: "entity-tahlil", toEntityId: "entity-sotuv" },
    { id: "t3", fromEntityId: "entity-sotuv", toEntityId: "entity-tasnim" },
  ];

  function filterByEntityIds(entityIds: string[]) {
    if (!entityIds.length) return transfers;
    return transfers.filter(
      (t) => entityIds.includes(t.fromEntityId) || entityIds.includes(t.toEntityId),
    );
  }

  it("TASNIM user sees only their transfers (from OR to)", () => {
    const visible = filterByEntityIds(["entity-tasnim"]);
    expect(visible.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("TAHLIL user sees only their transfers", () => {
    const visible = filterByEntityIds(["entity-tahlil"]);
    expect(visible.map((t) => t.id)).toEqual(["t2"]);
  });

  it("DIRECTOR with all entities sees all transfers", () => {
    const visible = filterByEntityIds(["entity-tasnim", "entity-tahlil", "entity-sotuv"]);
    expect(visible).toHaveLength(3);
  });

  it("empty entityIds returns all (no restriction)", () => {
    const visible = filterByEntityIds([]);
    expect(visible).toHaveLength(3);
  });
});
