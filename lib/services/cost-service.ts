import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import type { CostEntryInput } from "@/lib/validators/acquisition";

/** amountUZS = amount * rate (rate is the to-UZS FX rate; 1 for UZS). */
export function toUZS(amount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(amount).times(rate);
}

export async function createCostEntry(input: CostEntryInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.costEntry.create({
      data: {
        scope: input.scope,
        category: input.category,
        entityId: input.entityId ?? null,
        titleId: input.titleId ?? null,
        editionId: input.editionId ?? null,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        rate: new Prisma.Decimal(input.rate),
        amountUZS: toUZS(input.amount, input.rate),
        date: new Date(input.date),
        campaign: input.campaign ?? null,
      },
    });
  });
}

export async function deleteCostEntry(id: string, userId: string) {
  return runWithAudit({ userId }, async () => prisma.costEntry.delete({ where: { id } }));
}

export async function listCostEntries(where: {
  titleId?: string;
  editionId?: string;
  entityId?: string;
  scope?: "TITLE" | "EDITION" | "FIXED";
}) {
  return prisma.costEntry.findMany({ where, orderBy: { date: "desc" } });
}

/** FIXED cost entries summed by entity for a given month "YYYY-MM". */
export async function fixedCostsByEntity(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return prisma.costEntry.groupBy({
    by: ["entityId"],
    where: { scope: "FIXED", date: { gte: start, lt: end } },
    _sum: { amountUZS: true },
  });
}
