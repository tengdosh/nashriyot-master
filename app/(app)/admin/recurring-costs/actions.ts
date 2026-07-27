"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  createRecurringCost,
  updateRecurringCost,
  archiveRecurringCost,
  applyRecurringCosts,
  recurringCostSchema,
  type RecurringCostInput,
} from "@/lib/services/recurring-cost-service";

export async function createRecurringCostAction(input: unknown) {
  const user = await requirePermission("admin.settings");
  const data = recurringCostSchema.parse(input) as RecurringCostInput;
  await createRecurringCost(data, user.id);
  revalidatePath("/admin/recurring-costs");
}

export async function updateRecurringCostAction(id: string, input: unknown) {
  const user = await requirePermission("admin.settings");
  const partial = recurringCostSchema.partial().parse(input);
  await updateRecurringCost(id, partial as Partial<RecurringCostInput>, user.id);
  revalidatePath("/admin/recurring-costs");
}

export async function archiveRecurringCostAction(id: string) {
  const user = await requirePermission("admin.settings");
  await archiveRecurringCost(id, user.id);
  revalidatePath("/admin/recurring-costs");
}

/** Manually trigger the recurring-costs job for the current month. */
export async function applyRecurringCostsAction(month: string) {
  const user = await requirePermission("admin.settings");
  const result = await applyRecurringCosts(month, user.id);
  revalidatePath("/admin/recurring-costs");
  return result;
}
