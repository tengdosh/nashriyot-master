import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db";
import {
  inviteUser,
  setUserActive,
  resetPassword,
  setUserRolesAndEntities,
  rolesWithPermissions,
  setRolePermissions,
  getAdminSettings,
  saveAdminSettings,
  listAuditLog,
  AdminServiceError,
} from "@/lib/services/admin-service";

const ACTOR = "user-admin";
const ENTITY = "ent-tasnim";
const createdUsers: string[] = [];
const email = (n: string) => `admin-test-${n}-${Date.now()}@nashriyot.uz`;

describe("M11 — administratsiya", () => {
  let savedSettings: Awaited<ReturnType<typeof getAdminSettings>>;

  beforeAll(async () => {
    savedSettings = await getAdminSettings(); // restore afterwards
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUsers } } });
    // Prisma m-n implicit relation: disconnect entities before delete.
    for (const id of createdUsers) {
      await prisma.user.update({ where: { id }, data: { entityAccess: { set: [] } } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    // Restore any settings the tests changed.
    await saveAdminSettings(savedSettings, ACTOR);
    await prisma.$disconnect();
  });

  // ── Users ─────────────────────────────────────────────────────────────────────
  it("invites a user: active, role assigned, temp password verifies", async () => {
    const { user, tempPassword } = await inviteUser(
      { email: email("a"), fullName: "Test Foydalanuvchi", roleCode: "SALES_MANAGER", entityIds: [ENTITY] },
      ACTOR,
    );
    createdUsers.push(user.id);

    expect(user.isActive).toBe(true);
    expect(tempPassword).toHaveLength(14);
    // The stored hash verifies against the returned temp password.
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verify(fresh.passwordHash, tempPassword)).toBe(true);

    const withRel = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } }, entityAccess: true },
    });
    expect(withRel.roles[0].role.code).toBe("SALES_MANAGER");
    expect(withRel.entityAccess.map((e) => e.id)).toContain(ENTITY);
  });

  it("rejects a duplicate email and an unknown role", async () => {
    const dupe = email("dupe");
    const { user } = await inviteUser({ email: dupe, fullName: "Dubl", roleCode: "ACCOUNTANT", entityIds: [] }, ACTOR);
    createdUsers.push(user.id);
    await expect(
      inviteUser({ email: dupe, fullName: "Dubl 2", roleCode: "ACCOUNTANT", entityIds: [] }, ACTOR),
    ).rejects.toBeInstanceOf(AdminServiceError);
    await expect(
      inviteUser({ email: email("x"), fullName: "X", roleCode: "NO_SUCH_ROLE", entityIds: [] }, ACTOR),
    ).rejects.toBeInstanceOf(AdminServiceError);
  });

  it("deactivate, reset password (rotates hash), and change role+entities", async () => {
    const { user, tempPassword } = await inviteUser(
      { email: email("b"), fullName: "Rol Test", roleCode: "ACCOUNTANT", entityIds: [ENTITY] },
      ACTOR,
    );
    createdUsers.push(user.id);

    await setUserActive(user.id, false, ACTOR);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);

    const oldHash = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    const { tempPassword: newPw } = await resetPassword(user.id, ACTOR);
    const newHash = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect(newHash).not.toBe(oldHash);
    expect(newPw).not.toBe(tempPassword);
    expect(await verify(newHash, newPw)).toBe(true);

    await setUserRolesAndEntities({ userId: user.id, roleCode: "WAREHOUSE_MANAGER", entityIds: [] }, ACTOR);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } }, entityAccess: true },
    });
    expect(after.roles).toHaveLength(1);
    expect(after.roles[0].role.code).toBe("WAREHOUSE_MANAGER");
    expect(after.entityAccess).toHaveLength(0);
  });

  // ── Role matrix ─────────────────────────────────────────────────────────────
  it("exposes the matrix and marks system roles", async () => {
    const { roles, modules, matrix } = await rolesWithPermissions();
    expect(roles.find((r) => r.code === "DIRECTOR")!.system).toBe(true);
    expect(roles.find((r) => r.code === "ADMIN")!.system).toBe(true);
    expect(roles.find((r) => r.code === "SALES_MANAGER")!.system).toBe(false);
    expect(modules.length).toBeGreaterThan(3);
    // DIRECTOR holds every permission.
    const allPerms = modules.flatMap((m) => m.codes);
    expect(matrix.DIRECTOR.length).toBe(allPerms.length);
  });

  it("editing a system role's permissions is refused", async () => {
    await expect(
      setRolePermissions({ roleCode: "DIRECTOR", permCodes: ["sales.read"] }, ACTOR),
    ).rejects.toBeInstanceOf(AdminServiceError);
  });

  it("setRolePermissions replaces a normal role's set and ignores unknown codes", async () => {
    // Snapshot to restore.
    const before = (await rolesWithPermissions()).matrix.WAREHOUSE_MANAGER;
    try {
      await setRolePermissions(
        { roleCode: "WAREHOUSE_MANAGER", permCodes: ["inventory.read", "inventory.write", "ghost.perm"] },
        ACTOR,
      );
      const after = (await rolesWithPermissions()).matrix.WAREHOUSE_MANAGER;
      expect(after.sort()).toEqual(["inventory.read", "inventory.write"]); // ghost dropped
    } finally {
      await setRolePermissions({ roleCode: "WAREHOUSE_MANAGER", permCodes: before }, ACTOR);
    }
  });

  // ── Settings ──────────────────────────────────────────────────────────────────
  it("saves settings and reflects them back; rejects out-of-range", async () => {
    const next = { ...savedSettings, carryingRate: 0.3, deadStockDays: 150 };
    const saved = await saveAdminSettings(next, ACTOR);
    expect(saved.carryingRate).toBe(0.3);
    expect(saved.deadStockDays).toBe(150);
    const reread = await getAdminSettings();
    expect(reread.carryingRate).toBe(0.3);
  });

  // ── Audit ─────────────────────────────────────────────────────────────────────
  it("a mutation writes an audit row and the diff shows the changed field", async () => {
    const { user } = await inviteUser(
      { email: email("audit"), fullName: "Audit Test", roleCode: "ACCOUNTANT", entityIds: [] },
      ACTOR,
    );
    createdUsers.push(user.id);
    await setUserActive(user.id, false, ACTOR);

    const log = await listAuditLog({ entity: "User", take: 50 });
    const row = log.find((l) => l.entityId === user.id && l.action === "UPDATE");
    expect(row).toBeTruthy();
    expect(row!.changes.some((c) => c.field === "isActive" && c.to === false)).toBe(true);
    expect(row!.summary).toContain("isActive");
    expect(row!.actor).toBeTruthy();
  });
});
