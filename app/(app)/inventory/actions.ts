"use server";

import { revalidatePath } from "next/cache";
import type { DisposalAction } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import {
  adjustSchema,
  transferSchema,
  returnSchema,
  writeDownSchema,
  deadStockSettingsSchema,
} from "@/lib/validators/inventory";
import { adjustStock, transferStock, returnStock } from "@/lib/services/inventory-service";
import {
  startDisposal,
  createWriteDown,
  approveWriteDown,
  rejectWriteDown,
} from "@/lib/services/dead-stock-service";
import { saveInventorySettings } from "@/lib/services/inventory-settings";
import { runJob } from "@/jobs";

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/dead-stock");
}

export async function adjustStockAction(input: unknown) {
  const user = await requirePermission("inventory.adjust");
  await adjustStock(adjustSchema.parse(input), user.id);
  revalidateInventory();
}

export async function transferStockAction(input: unknown) {
  const user = await requirePermission("inventory.write");
  await transferStock(transferSchema.parse(input), user.id);
  revalidateInventory();
}

export async function returnStockAction(input: unknown) {
  const user = await requirePermission("inventory.write");
  await returnStock(returnSchema.parse(input), user.id);
  revalidateInventory();
}

export async function startDisposalAction(productId: string, action: DisposalAction) {
  const user = await requirePermission("inventory.write");
  await startDisposal(productId, action, user.id);
  revalidatePath("/inventory/dead-stock");
}

/** Step 6 of the ladder. Submitting never moves stock — only approval does. */
export async function createWriteDownAction(input: unknown) {
  const user = await requirePermission("inventory.adjust");
  await createWriteDown(writeDownSchema.parse(input), user.id);
  revalidatePath("/inventory/dead-stock");
}

export async function approveWriteDownAction(id: string) {
  // Maker-checker is enforced in the service; the UI only hides the button.
  const user = await requirePermission("inventory.adjust");
  await approveWriteDown(id, user.id);
  revalidateInventory();
}

export async function rejectWriteDownAction(id: string, reason: string) {
  const user = await requirePermission("inventory.adjust");
  await rejectWriteDown(id, user.id, reason);
  revalidatePath("/inventory/dead-stock");
}

export async function saveDeadStockSettingsAction(input: unknown) {
  await requirePermission("admin.settings");
  await saveInventorySettings(deadStockSettingsSchema.parse(input));
  revalidatePath("/inventory/dead-stock");
}

/** Run the scanner on demand instead of waiting for 02:00. */
export async function rescanDeadStockAction() {
  const user = await requirePermission("admin.settings");
  const res = await runJob("dead-stock-scan", user.id);
  revalidatePath("/inventory/dead-stock");
  return res.result;
}

export async function recalcAbcAction() {
  const user = await requirePermission("admin.settings");
  const res = await runJob("abc", user.id);
  revalidatePath("/inventory/abc");
  return res.result;
}
