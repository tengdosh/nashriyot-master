"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { scenarioSaveSchema } from "@/lib/validators/acquisition";
import { saveScenario, approveScenario } from "@/lib/services/scenario-service";

export async function saveScenarioAction(input: unknown): Promise<{ id: string }> {
  const user = await requirePermission("acquisitions.write");
  const data = scenarioSaveSchema.parse(input);
  const s = await saveScenario(data, user.id);
  revalidatePath("/acquisitions");
  return { id: s.id };
}

export async function approveScenarioAction(
  id: string,
): Promise<{ editionId: string | null; costDrafts: number }> {
  const user = await requirePermission("acquisitions.write");
  const r = await approveScenario(id, user.id);
  revalidatePath("/acquisitions");
  return r;
}
