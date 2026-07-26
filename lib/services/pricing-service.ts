import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { elasticity } from "@/lib/ai-client";
import { suggestPrice } from "@/lib/pricing";
import { minViablePrice } from "@/lib/finance";
import { fifoAvgUnitCost } from "./inventory-service";

/**
 * Dynamic pricing service (spec v1 §6.7 / §5.10). Gets the elasticity from the
 * AI service, computes the floor, runs the pure recommender, and persists a
 * PriceRecommendation for HUMAN approval — it never changes a price on its own.
 *
 * Floor: today the P_min floor from lib/finance (unit cost from FIFO). v2 wants
 * `getDecisionFloor(sku)` (sunk-cost-free) once M12 lands; documented so the
 * swap is a one-liner here.
 */

export class PricingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingServiceError";
  }
}

/** Price/quantity observations from sealed sales — the elasticity input. */
async function priceQtyPoints(productId: string): Promise<{ price: number; qty: number }[]> {
  const rows = await prisma.$queryRaw<{ price: string; qty: number }[]>`
    SELECT (sol."unitPrice" * (1 - sol."discountRate"))::text AS price, SUM(sol.qty)::int AS qty
    FROM "SalesOrderLine" sol
    JOIN "SalesOrder" so ON so.id = sol."orderId"
    WHERE sol."productId" = ${productId} AND so.status IN ('SHIPPED','INVOICED','PAID')
    GROUP BY 1
  `;
  return rows.map((r) => ({ price: Number(r.price), qty: r.qty }));
}

/**
 * Compute and persist a price recommendation. Returns:
 *  - null              → AI service unavailable (degrade),
 *  - { skipped: true } → not enough data, or the move is under 3%.
 */
export async function suggestPriceFor(productId: string, userId: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, listPrice: true },
  });

  const points = await priceQtyPoints(productId);
  const e = await elasticity(points);
  if (!e) return null; // AI down
  if (e.elasticity == null) {
    return { skipped: true as const, reason: "Elastiklikni baholash uchun narx xilma-xilligi yetarli emas" };
  }

  const unitCost = await fifoAvgUnitCost(productId);
  // Floor = P_min at zero discount/royalty (unit cost must be recoverable).
  const floor = unitCost.gt(0)
    ? minViablePrice({ uc: unitCost, discountRate: 0, royaltyRate: 0 })
    : new Prisma.Decimal(product.listPrice).times(0.5);

  const refQty = points.reduce((a, p) => a + p.qty, 0) / (points.length || 1);
  const s = suggestPrice({
    currentPrice: product.listPrice,
    floorPrice: floor,
    elasticity: e.elasticity,
    refQty,
  });

  if (!s.changed) {
    return { skipped: true as const, reason: s.rationale };
  }

  const rec = await runWithAudit({ userId }, async () =>
    prisma.priceRecommendation.create({
      data: {
        productId,
        currentPrice: s.currentPrice,
        suggestedPrice: s.suggestedPrice,
        floorPrice: s.floorPrice,
        rationale: `${s.rationale} (elastiklik r²=${e.r2 ?? "—"}, ${points.length} nuqta)`,
        status: "PENDING",
      },
    }),
  );
  return { skipped: false as const, recommendation: rec, suggestion: s };
}

/**
 * Accept a recommendation: update the product's list price. The audit extension
 * records the before/after — that IS the price history (spec §5.10). Requires
 * ai.apply at the action layer; a below-floor accept is refused defensively.
 */
export async function acceptPrice(recId: string, userId: string) {
  const rec = await prisma.priceRecommendation.findUniqueOrThrow({ where: { id: recId } });
  if (rec.status !== "PENDING") {
    throw new PricingServiceError(`Faqat kutilayotgan tavsiya qabul qilinadi (holat: ${rec.status})`);
  }
  if (new Prisma.Decimal(rec.suggestedPrice).lt(rec.floorPrice)) {
    throw new PricingServiceError("Tavsiya narxi poldan past — qabul qilinmaydi");
  }

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: rec.productId }, data: { listPrice: rec.suggestedPrice } });
      return tx.priceRecommendation.update({ where: { id: rec.id }, data: { status: "ACCEPTED" } });
    }),
  );
}

export async function rejectPrice(recId: string, userId: string) {
  const rec = await prisma.priceRecommendation.findUniqueOrThrow({ where: { id: recId } });
  if (rec.status !== "PENDING") {
    throw new PricingServiceError("Faqat kutilayotgan tavsiya rad etiladi");
  }
  return runWithAudit({ userId }, async () =>
    prisma.priceRecommendation.update({ where: { id: recId }, data: { status: "REJECTED" } }),
  );
}

export async function pendingRecommendations() {
  return prisma.priceRecommendation.findMany({
    where: { status: "PENDING" },
    include: { product: { select: { sku: true, title: { select: { workTitle: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}
