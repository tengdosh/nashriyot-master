import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";

// ── Zod validators ────────────────────────────────────────────────────────────

const COST_CATEGORIES = [
  "HUQUQ","TARJIMA","TAHRIR","DIZAYN","MUALLIF_BUYOUT","BOSMA",
  "MARKETING_TITLE","MARKETING_BRAND","IJARA","OYLIK","KOMMUNAL","BOSHQA",
] as const;

const CURRENCIES = ["UZS", "USD", "TRY", "EUR"] as const;

export const recurringCostSchema = z.object({
  entityId:   z.string().min(1),
  label:      z.string().min(1, "Nomi majburiy"),
  amount:     z.number().positive("Summa musbat bo'lishi kerak"),
  currency:   z.enum(CURRENCIES).default("UZS"),
  rate:       z.number().positive().default(1),
  category:   z.enum(COST_CATEGORIES).default("BOSHQA"),
  scope:      z.enum(["FIXED", "VAR"]).default("FIXED"),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
  endMonth:   z.string().regex(/^\d{4}-\d{2}$/).nullish(),
});
export type RecurringCostInput = z.infer<typeof recurringCostSchema>;

// ── List ──────────────────────────────────────────────────────────────────────

export async function listRecurringCosts(entityId?: string) {
  return prisma.recurringCost.findMany({
    where: {
      archivedAt: null,
      ...(entityId ? { entityId } : {}),
    },
    include: { entity: { select: { id: true, name: true } } },
    orderBy: [{ entityId: "asc" }, { label: "asc" }],
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRecurringCost(input: RecurringCostInput, userId: string) {
  const data = recurringCostSchema.parse(input);
  return runWithAudit({ userId }, async () => {
    return prisma.recurringCost.create({
      data: {
        entityId:   data.entityId,
        label:      data.label,
        amount:     new Prisma.Decimal(data.amount),
        currency:   data.currency,
        rate:       new Prisma.Decimal(data.rate),
        category:   data.category,
        scope:      data.scope,
        dayOfMonth: data.dayOfMonth,
        startMonth: data.startMonth,
        endMonth:   data.endMonth ?? null,
      },
    });
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateRecurringCost(
  id: string,
  input: Partial<RecurringCostInput>,
  userId: string,
) {
  const existing = await prisma.recurringCost.findUniqueOrThrow({ where: { id } });
  if (existing.archivedAt) throw new Error("Arxivlangan yozuvni tahrirlash mumkin emas");

  const partial = recurringCostSchema.partial().parse(input);
  return runWithAudit({ userId }, async () => {
    return prisma.recurringCost.update({
      where: { id },
      data: {
        ...(partial.label      !== undefined ? { label:      partial.label }                       : {}),
        ...(partial.amount     !== undefined ? { amount:     new Prisma.Decimal(partial.amount) }  : {}),
        ...(partial.currency   !== undefined ? { currency:   partial.currency }                    : {}),
        ...(partial.rate       !== undefined ? { rate:       new Prisma.Decimal(partial.rate) }    : {}),
        ...(partial.category   !== undefined ? { category:   partial.category }                    : {}),
        ...(partial.scope      !== undefined ? { scope:      partial.scope }                       : {}),
        ...(partial.dayOfMonth !== undefined ? { dayOfMonth: partial.dayOfMonth }                  : {}),
        ...(partial.startMonth !== undefined ? { startMonth: partial.startMonth }                  : {}),
        ...(partial.endMonth   !== undefined ? { endMonth:   partial.endMonth ?? null }            : {}),
      },
    });
  });
}

// ── Archive ───────────────────────────────────────────────────────────────────

export async function archiveRecurringCost(id: string, userId: string) {
  return runWithAudit({ userId }, async () => {
    return prisma.recurringCost.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  });
}

// ── Apply (idempotent month runner) ───────────────────────────────────────────

/**
 * Create CostEntry rows for every active RecurringCost template that covers
 * the given month. Safe to run multiple times — already-created entries are
 * skipped (idempotent keyed on refType='RecurringCost' + refId + month window).
 */
export async function applyRecurringCosts(
  month: string,   // "YYYY-MM"
  userId: string,
): Promise<{ created: number; skipped: number }> {
  const [year, m] = month.split("-").map(Number);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd   = new Date(year, m,     1);

  // All active templates whose window includes this month.
  const templates = await prisma.recurringCost.findMany({
    where: {
      startMonth: { lte: month },
      OR: [{ endMonth: null }, { endMonth: { gte: month } }],
      archivedAt: null,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const rc of templates) {
    // Idempotency check — one CostEntry per template per month.
    const existing = await prisma.costEntry.findFirst({
      where: {
        refType: "RecurringCost",
        refId:   rc.id,
        date:    { gte: monthStart, lt: monthEnd },
      },
    });
    if (existing) { skipped++; continue; }

    await runWithAudit({ userId }, async () => {
      await prisma.costEntry.create({
        data: {
          entityId:  rc.entityId,
          scope:     "FIXED", // recurring entity-level overhead is always FIXED scope
          category:  rc.category,
          amount:    rc.amount,
          currency:  rc.currency,
          rate:      rc.rate,
          amountUZS: new Prisma.Decimal(rc.amount).times(rc.rate),
          date:      new Date(year, m - 1, rc.dayOfMonth),
          campaign:  `${rc.label} (avtomatik)`,
          refType:   "RecurringCost",
          refId:     rc.id,
        },
      });
    });
    created++;
  }

  // Stamp lastRunAt on processed templates.
  if (templates.length > 0) {
    await prisma.recurringCost.updateMany({
      where: { id: { in: templates.map((c) => c.id) } },
      data:  { lastRunAt: new Date() },
    });
  }

  return { created, skipped };
}
