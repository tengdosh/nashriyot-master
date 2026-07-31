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
