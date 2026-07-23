import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAccessEntity,
  assertPermission,
  assertRowAccess,
  AuthzError,
  type RbacUser,
} from "@/lib/rbac";
import { assertDifferentApprover } from "@/lib/maker-checker";

// Returns the AuthzError thrown by fn, or fails the test if nothing throws.
function grab(fn: () => void): AuthzError {
  try {
    fn();
  } catch (e) {
    return e as AuthzError;
  }
  throw new Error("expected an AuthzError to be thrown");
}

const director: RbacUser = {
  id: "user-director",
  roles: ["DIRECTOR"],
  permissions: ["dashboard.read", "inventory.write", "royalty.approve", "admin.users"],
  entityAccess: ["ent-tasnim", "ent-tahlil", "ent-sotuv"],
};

const salesManager: RbacUser = {
  id: "user-sales",
  roles: ["SALES_MANAGER"],
  permissions: ["dashboard.read", "sales.read", "inventory.read"],
  entityAccess: ["ent-sotuv"],
};

describe("rbac — permissions", () => {
  it("hasPermission reflects the permission set", () => {
    expect(hasPermission(salesManager, "sales.read")).toBe(true);
    expect(hasPermission(salesManager, "royalty.approve")).toBe(false);
    expect(hasPermission(null, "sales.read")).toBe(false);
  });

  it("assertPermission → 401 when unauthenticated", () => {
    expect(grab(() => assertPermission(null, "sales.read")).status).toBe(401);
  });

  it("assertPermission → 403 when permission missing", () => {
    const err = grab(() => assertPermission(salesManager, "royalty.approve"));
    expect(err).toBeInstanceOf(AuthzError);
    expect(err.status).toBe(403);
  });

  it("assertPermission passes when permission present", () => {
    expect(() => assertPermission(salesManager, "sales.read")).not.toThrow();
  });
});

describe("rbac — row access (entityAccess)", () => {
  it("director can access every subject", () => {
    expect(canAccessEntity(director, "ent-tasnim")).toBe(true);
    expect(() => assertRowAccess(director, { entityId: "ent-tasnim" })).not.toThrow();
  });

  it("sales manager cannot see a Tasnim MAIN warehouse row (entityId ent-tasnim → 403)", () => {
    expect(canAccessEntity(salesManager, "ent-tasnim")).toBe(false);
    const err = grab(() => assertRowAccess(salesManager, { entityId: "ent-tasnim" }));
    expect(err).toBeInstanceOf(AuthzError);
    expect(err.status).toBe(403);
  });

  it("sales manager CAN see its own subject", () => {
    expect(() => assertRowAccess(salesManager, { entityId: "ent-sotuv" })).not.toThrow();
  });

  it("contributor scoping denies a mismatched contributorId", () => {
    const author: RbacUser = {
      id: "u",
      roles: ["AUTHOR"],
      permissions: ["portal.read"],
      entityAccess: [],
      contributorId: "contrib-1",
    };
    expect(() => assertRowAccess(author, { contributorId: "contrib-1" })).not.toThrow();
    expect(grab(() => assertRowAccess(author, { contributorId: "contrib-2" })).status).toBe(403);
  });
});

describe("maker-checker", () => {
  it("blocks the creator from approving", () => {
    expect(grab(() => assertDifferentApprover("user-a", "user-a")).status).toBe(403);
  });
  it("allows a different approver", () => {
    expect(() => assertDifferentApprover("user-a", "user-b")).not.toThrow();
  });
});
