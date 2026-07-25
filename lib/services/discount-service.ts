import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { suggestDiscount, type DiscountRuleInput, type DiscountSuggestion } from "@/lib/sales";

/**
 * DB-backed wrapper over the pure rule engine (v2 §7.3). Loads the active rules
 * once and resolves each line against them, so a multi-line order does not fire
 * one query per line.
 *
 * The returned `source` is what the UI shows next to the number — a discount the
 * salesperson cannot explain is a discount they will argue with.
 */
export async function loadDiscountRules(): Promise<DiscountRuleInput[]> {
  const rows = await prisma.discountRule.findMany({
    where: { isActive: true },
    orderBy: { priority: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    refId: r.refId,
    minQty: r.minQty,
    rate: new Prisma.Decimal(r.rate),
    priority: r.priority,
    isActive: r.isActive,
  }));
}

export async function suggestDiscountFor(ctx: {
  partnerId?: string | null;
  titleId?: string | null;
  entityId?: string | null;
  qty: number;
}): Promise<DiscountSuggestion> {
  return suggestDiscount(await loadDiscountRules(), ctx);
}

/** Test calculator for /discount-rules — same engine, no writes. */
export async function previewDiscount(ctx: {
  partnerId?: string | null;
  titleId?: string | null;
  entityId?: string | null;
  qty: number;
  unitPrice: number;
}) {
  const s = await suggestDiscountFor(ctx);
  const effective = new Prisma.Decimal(ctx.unitPrice).times(
    new Prisma.Decimal(1).minus(s.rate.toString()),
  );
  return { rate: s.rate, source: s.source, ruleId: s.ruleId, effectivePrice: effective };
}
