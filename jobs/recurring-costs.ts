import { applyRecurringCosts } from "@/lib/services/recurring-cost-service";

/**
 * Nightly job (00:30): generate CostEntry rows for the current month from all
 * active RecurringCost templates. Idempotent — safe to run more than once.
 */
export async function runRecurringCosts(
  userId: string,
  now?: Date,
): Promise<{ created: number; skipped: number }> {
  const date = now ?? new Date();
  const month = date.toISOString().slice(0, 7); // "YYYY-MM"
  return applyRecurringCosts(month, userId);
}
