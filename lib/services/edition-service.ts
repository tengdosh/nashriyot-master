import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import type { EditionCreateInput, ProductCreateInput } from "@/lib/validators/title";

/** Create the next edition (editionNo auto-increments per title). */
export async function createEdition(input: EditionCreateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    const count = await prisma.edition.count({ where: { titleId: input.titleId } });
    return await prisma.edition.create({
      data: {
        titleId: input.titleId,
        editionNo: count + 1,
        plannedRun: input.plannedRun,
        status: "PLANNED",
        notes: input.notes ?? null,
      },
    });
  });
}

/** Create a SKU (product) linked to a title and (optionally) an edition. */
export async function createProduct(input: ProductCreateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.product.create({
      data: {
        titleId: input.titleId,
        editionId: input.editionId ?? null,
        format: input.format,
        isbn13: input.isbn13 ?? null,
        sku: input.sku ?? null,
        pages: input.pages ?? null,
        listPrice: new Prisma.Decimal(input.listPrice),
        vatRate: new Prisma.Decimal(input.vatRate),
      },
    });
  });
}

/** Sum of TITLE-scope cost entries — the "unique load" (foundation for M12). */
export async function titleUniqueCost(titleId: string): Promise<Prisma.Decimal> {
  const agg = await prisma.costEntry.aggregate({
    where: { titleId, scope: "TITLE" },
    _sum: { amountUZS: true },
  });
  return agg._sum.amountUZS ?? new Prisma.Decimal(0);
}

/** ⌘K full-text search over titles (tsvector), optionally scoped to entities. */
export async function searchTitles(query: string, entityIds?: string[] | null) {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Title"
    WHERE "searchVector" @@ plainto_tsquery('simple', ${q})
    LIMIT 20`;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  return prisma.title.findMany({
    where: {
      id: { in: ids },
      ...(entityIds && entityIds.length ? { entityId: { in: entityIds } } : {}),
    },
    select: { id: true, workTitle: true, status: true, ownerType: true },
    take: 10,
  });
}
