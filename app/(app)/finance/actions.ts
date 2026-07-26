"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { payableCreateSchema, payablePaySchema, reconMatchSchema } from "@/lib/validators/finance";
import { createPayable, payPayable, applyMatch, reconciliation } from "@/lib/services/finance-service";

export async function createPayableAction(input: unknown) {
  const user = await requirePermission("finance.write");
  const p = await createPayable(payableCreateSchema.parse(input), user.id);
  revalidatePath("/finance/payables");
  revalidatePath("/finance");
  return p.id;
}

export async function payPayableAction(input: unknown) {
  const user = await requirePermission("finance.write");
  await payPayable(payablePaySchema.parse(input), user.id);
  revalidatePath("/finance/payables");
  revalidatePath("/finance/reconciliation");
  revalidatePath("/finance");
}

export async function applyMatchAction(input: unknown) {
  const user = await requirePermission("finance.reconcile");
  await applyMatch(reconMatchSchema.parse(input), user.id);
  revalidatePath("/finance/reconciliation");
}

type BankRowInput = { ref: string; partnerId: string | null; amount: number; date: string };

/** Run auto-matching for a set of (manually entered) bank rows. */
export async function reconcileAction(bank: BankRowInput[], days = 2, amountTol = 0) {
  await requirePermission("finance.reconcile");
  const report = await reconciliation(
    bank.map((b) => ({ ref: b.ref, partnerId: b.partnerId, amount: b.amount, date: new Date(b.date) })),
    { days, amountTol },
  );
  return { matches: report.matches, unmatchedBank: report.unmatchedBank };
}
