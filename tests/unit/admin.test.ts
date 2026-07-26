import { describe, it, expect } from "vitest";
import {
  isSystemRole,
  SYSTEM_ROLES,
  groupPermissionsByModule,
  buildRoleMatrix,
  toggleMatrixCell,
  matrixDiff,
  auditDiff,
  summarizeAudit,
  generateTempPassword,
  AdminError,
} from "@/lib/admin";

describe("system roles", () => {
  it("DIRECTOR and ADMIN are system roles", () => {
    expect(isSystemRole("DIRECTOR")).toBe(true);
    expect(isSystemRole("ADMIN")).toBe(true);
    expect(isSystemRole("SALES_MANAGER")).toBe(false);
    expect(SYSTEM_ROLES).toHaveLength(2);
  });
});

describe("groupPermissionsByModule", () => {
  it("groups by module and sorts modules + codes", () => {
    const g = groupPermissionsByModule([
      { code: "sales.write", module: "sales" },
      { code: "sales.read", module: "sales" },
      { code: "admin.users", module: "admin" },
    ]);
    expect(g.map((m) => m.module)).toEqual(["admin", "sales"]);
    expect(g[1].codes).toEqual(["sales.read", "sales.write"]);
  });
});

describe("permission matrix", () => {
  const roles = [
    { code: "SALES_MANAGER", name: "Sotuv" },
    { code: "DIRECTOR", name: "Direktor" },
  ];
  const rolePerms = [
    { roleCode: "SALES_MANAGER", permCode: "sales.read" },
    { roleCode: "SALES_MANAGER", permCode: "sales.write" },
    { roleCode: "DIRECTOR", permCode: "sales.read" },
  ];

  it("builds a role → permission-set map, empty set for a role with none", () => {
    const m = buildRoleMatrix([...roles, { code: "AUTHOR", name: "Muallif" }], rolePerms);
    expect(m.SALES_MANAGER.has("sales.read")).toBe(true);
    expect(m.SALES_MANAGER.size).toBe(2);
    expect(m.AUTHOR.size).toBe(0);
  });

  it("creates a set on the fly for a rolePerm whose role is not in the list", () => {
    const m = buildRoleMatrix(roles, [{ roleCode: "GHOST_ROLE", permCode: "x.read" }]);
    expect(m.GHOST_ROLE.has("x.read")).toBe(true);
  });

  it("toggling adds then removes, returning a new set (no mutation)", () => {
    const before = new Set(["sales.read"]);
    const added = toggleMatrixCell(before, "SALES_MANAGER", "sales.write");
    expect(added.has("sales.write")).toBe(true);
    expect(before.has("sales.write")).toBe(false); // input untouched
    const removed = toggleMatrixCell(added, "SALES_MANAGER", "sales.write");
    expect(removed.has("sales.write")).toBe(false);
  });

  it("refuses to edit a system role", () => {
    expect(() => toggleMatrixCell(new Set(), "DIRECTOR", "sales.read")).toThrow(AdminError);
    expect(() => toggleMatrixCell(new Set(), "ADMIN", "sales.read")).toThrow(AdminError);
  });

  it("matrixDiff reports added/removed, sorted", () => {
    const d = matrixDiff(new Set(["a", "b", "c"]), new Set(["b", "d", "e"]));
    expect(d.added).toEqual(["d", "e"]);
    expect(d.removed).toEqual(["a", "c"]);
  });
});

describe("auditDiff", () => {
  it("reports only the changed fields, ignoring timestamps", () => {
    const d = auditDiff(
      { name: "A", price: 100, updatedAt: "t1" },
      { name: "A", price: 120, updatedAt: "t2" },
    );
    expect(d).toEqual([{ field: "price", from: 100, to: 120 }]);
  });

  it("handles keys present on only one side and nested values", () => {
    const d = auditDiff({ a: 1 }, { a: 1, b: { x: 2 } });
    expect(d).toEqual([{ field: "b", from: null, to: { x: 2 } }]);

    const nested = auditDiff({ tiers: [1, 2] }, { tiers: [1, 3] });
    expect(nested[0].field).toBe("tiers");
  });

  it("null/non-object snapshots degrade to empty objects", () => {
    expect(auditDiff(null, null)).toEqual([]);
    expect(auditDiff(null, { a: 1 })).toEqual([{ field: "a", from: null, to: 1 }]);
    expect(auditDiff({ a: 1 }, null)).toEqual([{ field: "a", from: 1, to: null }]);
  });

  it("summarizeAudit describes create/delete/update", () => {
    expect(summarizeAudit("CREATE", [])).toBe("Yaratildi");
    expect(summarizeAudit("DELETE", [])).toBe("Oʻchirildi");
    expect(summarizeAudit("UPDATE", [])).toBe("Oʻzgarishsiz");
    expect(summarizeAudit("UPDATE", [{ field: "price", from: 1, to: 2 }])).toContain("price");
  });
});

describe("generateTempPassword", () => {
  it("has the requested length and one of each character class", () => {
    const pw = generateTempPassword(14);
    expect(pw).toHaveLength(14);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[!@#$%*+-]/.test(pw)).toBe(true);
  });

  it("is deterministic with an injected RNG and shuffles the guaranteed classes", () => {
    let seed = 0.42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280 / 233280;
      return seed;
    };
    const a = generateTempPassword(12, rand);
    seed = 0.42;
    const b = generateTempPassword(12, rand);
    expect(a).toBe(b); // same seed → same password
    expect(a).toHaveLength(12);
  });

  it("rejects too-short lengths", () => {
    expect(() => generateTempPassword(4)).toThrow(AdminError);
  });
});
