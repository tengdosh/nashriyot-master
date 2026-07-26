"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  inviteUserSchema,
  setUserRolesSchema,
  setRolePermsSchema,
  adminSettingsSchema,
} from "@/lib/validators/admin";
import {
  inviteUser,
  setUserActive,
  archiveUser,
  resetPassword,
  setUserRolesAndEntities,
  setRolePermissions,
  saveAdminSettings,
} from "@/lib/services/admin-service";

export async function inviteUserAction(input: unknown) {
  const user = await requirePermission("admin.users");
  const { tempPassword } = await inviteUser(inviteUserSchema.parse(input), user.id);
  revalidatePath("/admin/users");
  return { tempPassword };
}

export async function setUserActiveAction(userId: string, active: boolean) {
  const user = await requirePermission("admin.users");
  await setUserActive(userId, active, user.id);
  revalidatePath("/admin/users");
}

export async function archiveUserAction(userId: string) {
  const user = await requirePermission("admin.users");
  await archiveUser(userId, user.id);
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(userId: string) {
  const user = await requirePermission("admin.users");
  const { tempPassword } = await resetPassword(userId, user.id);
  return { tempPassword };
}

export async function setUserRolesAction(input: unknown) {
  const user = await requirePermission("admin.users");
  await setUserRolesAndEntities(setUserRolesSchema.parse(input), user.id);
  revalidatePath("/admin/users");
}

export async function setRolePermsAction(input: unknown) {
  const user = await requirePermission("admin.roles");
  await setRolePermissions(setRolePermsSchema.parse(input), user.id);
  revalidatePath("/admin/roles");
}

export async function saveSettingsAction(input: unknown) {
  const user = await requirePermission("admin.settings");
  await saveAdminSettings(adminSettingsSchema.parse(input), user.id);
  revalidatePath("/admin/settings");
  // Settings feed inventory/analytics jobs — refresh those views' inputs next run.
  revalidatePath("/inventory/dead-stock");
}
