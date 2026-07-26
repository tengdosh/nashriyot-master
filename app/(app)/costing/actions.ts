"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { computeDailyCost } from "@/lib/services/costing-service";
import { runJob } from "@/jobs";

/** Recompute today's snapshot for one SKU (on-demand, otherwise nightly). */
export async function recomputeCostAction(productId: string) {
  const user = await requirePermission("costing.read");
  await computeDailyCost(productId, user.id);
  revalidatePath("/costing");
  revalidatePath(`/costing/${productId}`);
}

/** Snapshot every in-stock SKU now (admin) — the 01:00 job otherwise. */
export async function snapshotAllAction() {
  const user = await requirePermission("admin.settings");
  const res = await runJob("costing-snapshot", user.id);
  revalidatePath("/costing");
  return res.result;
}
