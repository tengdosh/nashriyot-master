import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import {
  isSystemRole,
  buildRoleMatrix,
  groupPermissionsByModule,
  generateTempPassword,
  auditDiff,
  summarizeAudit,
  type AuditAction,
} from "@/lib/admin";
import type {
  InviteUserInput,
  SetUserRolesInput,
  SetRolePermsInput,
  AdminSettingsInput,
} from "@/lib/validators/admin";

/**
 * Admin service (spec v1 §5.11): users, the role/permission matrix, editable
 * settings and the audit log. Every write goes through runWithAudit so the admin
 * screens are themselves audited. System roles (DIRECTOR/ADMIN) are protected.
 */

export class AdminServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminServiceError";
  }
}


// ── Users ─────────────────────────────────────────────────────────────────────

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: {
      roles: { include: { role: { select: { code: true, name: true } } } },
      entityAccess: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    isActive: u.isActive,
    archived: u.archivedAt != null,
    roles: u.roles.map((r) => r.role),
    entities: u.entityAccess,
  }));
}

/**
 * Invite a user: create them ACTIVE with a strong temp password (returned ONCE
 * so the admin can hand it over), assign the role and entity access. The plaintext
 * is never stored — only the argon2 hash.
 */
export async function inviteUser(input: InviteUserInput, actorId: string) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AdminServiceError("Bu email allaqachon roʻyxatdan oʻtgan");

  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new AdminServiceError(`Rol topilmadi: ${input.roleCode}`);

  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword);

  const user = await runWithAudit({ userId: actorId }, async () =>
    prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        isActive: true,
        entityAccess: { connect: input.entityIds.map((id) => ({ id })) },
        roles: { create: { roleId: role.id } },
      },
    }),
  );
  return { user, tempPassword };
}

export async function setUserActive(userId: string, active: boolean, actorId: string) {
  return runWithAudit({ userId: actorId }, async () =>
    prisma.user.update({ where: { id: userId }, data: { isActive: active } }),
  );
}

export async function archiveUser(userId: string, actorId: string) {
  return runWithAudit({ userId: actorId }, async () =>
    prisma.user.update({ where: { id: userId }, data: { archivedAt: new Date(), isActive: false } }),
  );
}

/** Rotate a user's password; returns the new temp password once. */
export async function resetPassword(userId: string, actorId: string) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword);
  await runWithAudit({ userId: actorId }, async () =>
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
  );
  return { tempPassword };
}

/** Replace a user's single role + entity access (one role per user in this app). */
export async function setUserRolesAndEntities(input: SetUserRolesInput, actorId: string) {
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new AdminServiceError(`Rol topilmadi: ${input.roleCode}`);

  return runWithAudit({ userId: actorId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: input.userId } });
      await tx.userRole.create({ data: { userId: input.userId, roleId: role.id } });
      return tx.user.update({
        where: { id: input.userId },
        data: { entityAccess: { set: input.entityIds.map((id) => ({ id })) } },
      });
    }),
  );
}

// ── Role / permission matrix ──────────────────────────────────────────────────

export async function rolesWithPermissions() {
  const [roles, perms, rolePerms] = await Promise.all([
    prisma.role.findMany({ orderBy: { code: "asc" } }),
    prisma.permission.findMany(),
    prisma.rolePermission.findMany({ include: { role: true, permission: true } }),
  ]);

  const matrix = buildRoleMatrix(
    roles.map((r) => ({ code: r.code, name: r.name })),
    rolePerms.map((rp) => ({ roleCode: rp.role.code, permCode: rp.permission.code })),
  );

  return {
    roles: roles.map((r) => ({ code: r.code, name: r.name, system: isSystemRole(r.code) })),
    modules: groupPermissionsByModule(perms.map((p) => ({ code: p.code, module: p.module }))),
    // Serialise sets to arrays for the client.
    matrix: Object.fromEntries(Object.entries(matrix).map(([k, v]) => [k, [...v]])),
  };
}

/**
 * Replace a role's permission set. System roles are immutable — always all
 * permissions — and the service refuses to touch them.
 */
export async function setRolePermissions(input: SetRolePermsInput, actorId: string) {
  if (isSystemRole(input.roleCode)) {
    throw new AdminServiceError(`${input.roleCode} tizim roli — ruxsatlari oʻzgartirilmaydi`);
  }
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new AdminServiceError(`Rol topilmadi: ${input.roleCode}`);

  // Only assign permissions that actually exist.
  const valid = await prisma.permission.findMany({ where: { code: { in: input.permCodes } } });
  const validIds = valid.map((p) => p.id);

  return runWithAudit({ userId: actorId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const permissionId of validIds) {
        await tx.rolePermission.create({ data: { roleId: role.id, permissionId } });
      }
      return { roleCode: input.roleCode, count: validIds.length };
    }),
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTING_KEYS = [
  "vatRate",
  "deadStockDays",
  "carryingRate",
  "expectedROI",
  "serviceLevelZ",
  "orderCost",
  "minTurnover",
  "goLiveDate",
] as const;

export async function getAdminSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => {
    const v = byKey.get(k);
    return typeof v === "number" ? v : d;
  };
  const str = (k: string): string | null => {
    const v = byKey.get(k);
    return typeof v === "string" ? v : null;
  };
  return {
    vatRate: num("vatRate", 0),
    deadStockDays: num("deadStockDays", 120),
    carryingRate: num("carryingRate", 0.2),
    expectedROI: num("expectedROI", 0.25),
    serviceLevelZ: num("serviceLevelZ", 1.65),
    orderCost: num("orderCost", 500_000),
    minTurnover: num("minTurnover", 0.5),
    goLiveDate: str("goLiveDate"),
  };
}

export async function saveAdminSettings(input: AdminSettingsInput, actorId: string) {
  return runWithAudit({ userId: actorId }, async () => {
    for (const key of SETTING_KEYS) {
      const raw = input[key as keyof AdminSettingsInput];
      if (raw == null) {
        await prisma.setting.deleteMany({ where: { key } });
        continue;
      }
      const value = raw as string | number;
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    return getAdminSettings();
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function listAuditLog(filter: { entity?: string; take?: number } = {}) {
  const rows = await prisma.auditLog.findMany({
    where: filter.entity ? { entity: filter.entity } : undefined,
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: filter.take ?? 100,
  });

  return rows.map((r) => {
    const changes = r.action === "UPDATE" ? auditDiff(r.before, r.after) : [];
    return {
      id: r.id,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action as AuditAction,
      actor: r.user?.fullName ?? r.user?.email ?? "tizim",
      createdAt: r.createdAt,
      summary: summarizeAudit(r.action as AuditAction, changes),
      changes,
      before: r.before,
      after: r.after,
    };
  });
}

/** Distinct entity names present in the audit log, for the filter dropdown. */
export async function auditEntities() {
  const rows = await prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } });
  return rows.map((r) => r.entity);
}
