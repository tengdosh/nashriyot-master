"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  contractCreateSchema,
  contractUpdateSchema,
  royaltyRunSchema,
} from "@/lib/validators/contract";
import {
  createContract,
  updateContract,
  activateContract,
  closeContract,
  checkTiers,
} from "@/lib/services/contract-service";
import {
  runRoyalty,
  approveRoyaltyRun,
  sendRoyaltyRun,
} from "@/lib/services/royalty-service";

function revalidateRights(runId?: string) {
  revalidatePath("/contracts");
  revalidatePath("/royalties/runs");
  if (runId) revalidatePath(`/royalties/runs/${runId}`);
}

export async function createContractAction(input: unknown) {
  const user = await requirePermission("royalty.write");
  const c = await createContract(contractCreateSchema.parse(input), user.id);
  revalidateRights();
  return c.id;
}

export async function updateContractAction(input: unknown) {
  const user = await requirePermission("royalty.write");
  await updateContract(contractUpdateSchema.parse(input), user.id);
  revalidateRights();
}

export async function activateContractAction(id: string) {
  const user = await requirePermission("royalty.write");
  await activateContract(id, user.id);
  // A BUYOUT activation writes a title cost, which changes M3's unique load.
  revalidateRights();
  revalidatePath("/acquisitions");
  revalidatePath("/titles");
}

export async function closeContractAction(id: string) {
  const user = await requirePermission("royalty.write");
  await closeContract(id, user.id);
  revalidateRights();
}

/** Live tier-ladder validation for the editor — pure, no writes. */
export async function checkTiersAction(
  tiers: { format?: string | null; fromUnits: number; toUnits?: number | null; rate: number; basis?: string }[],
) {
  await requirePermission("royalty.read");
  return checkTiers(tiers);
}

/** Build or rebuild the DRAFT run for a closed period. */
export async function runRoyaltyAction(input: unknown) {
  const user = await requirePermission("royalty.write");
  const { period } = royaltyRunSchema.parse(input);
  const res = await runRoyalty(period, user.id);
  revalidateRights(res.runId);
  return {
    runId: res.runId,
    period: res.period,
    statements: res.statements,
    skipped: res.skipped.length,
    totalEarned: res.totalEarned.toFixed(0),
    totalPayable: res.totalPayable.toFixed(0),
  };
}

export async function approveRoyaltyRunAction(runId: string) {
  // Maker-checker is enforced in the service; the UI only hides the button.
  const user = await requirePermission("royalty.approve");
  await approveRoyaltyRun(runId, user.id);
  revalidateRights(runId);
}

export async function sendRoyaltyRunAction(runId: string) {
  const user = await requirePermission("royalty.write");
  await sendRoyaltyRun(runId, user.id);
  revalidateRights(runId);
}
