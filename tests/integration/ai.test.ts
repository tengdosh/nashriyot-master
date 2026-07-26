import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import { createSalesOrder, confirmSalesOrder, shipSalesOrder } from "@/lib/services/sales-service";
import { refreshViews } from "@/lib/services/analytics-service";
import { aiHealth } from "@/lib/ai-client";
import { buildForecast, applyForecastToReorder, monthlyHistory, ForecastError } from "@/lib/services/forecast-service";
import { suggestPriceFor, acceptPrice, rejectPrice, PricingServiceError } from "@/lib/services/pricing-service";
import { AuthzError } from "@/lib/rbac";

const MAKER = "user-sales";
const MAIN = "wh-tasnim-main";
const OWN_STORE = "chan-ownstore";
const ENTITY = "ent-tasnim";

let productId = "";
const created = { titles: [] as string[], products: [] as string[], orders: [] as string[], forecasts: [] as string[], recs: [] as string[] };

/** Ship `qty` in a specific month so the materialized view builds monthly history. */
async function shipMonth(pid: string, qty: number, year: number, month: number, price: number) {
  await stockInTx({ productId: pid, warehouseId: MAIN, qty, unitCostUZS: 20_000 }, MAKER);
  const { order } = await createSalesOrder(
    { channelId: OWN_STORE, entityId: ENTITY, warehouseId: MAIN, customerName: "AI testi", lines: [{ productId: pid, qty, unitPrice: price, discountRate: 0 }] },
    MAKER,
  );
  created.orders.push(order.id);
  await confirmSalesOrder(order.id, MAKER);
  await shipSalesOrder(order.id, MAKER);
  await prisma.salesOrder.update({
    where: { id: order.id },
    data: { shippedDate: new Date(Date.UTC(year, month - 1, 15)) },
  });
}

let aiUp = false;

describe("M10 — AI Studio (prognoz + narxlash)", () => {
  beforeAll(async () => {
    aiUp = await aiHealth();
    const t = await prisma.title.create({
      data: { workTitle: "AI test kitob", ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    created.titles.push(t.id);
    const e = await prisma.edition.create({ data: { titleId: t.id, editionNo: 1, plannedRun: 20_000, status: "ACTIVE" } });
    const p = await prisma.product.create({
      data: { titleId: t.id, editionId: e.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(100_000), vatRate: new Prisma.Decimal(0) },
    });
    productId = p.id;
    created.products.push(p.id);

    // 20 months of gently rising demand at VARYING prices (so elasticity has signal).
    let m = 1;
    let y = 2025;
    for (let i = 0; i < 20; i++) {
      const qty = 100 + i * 5;
      const price = 100_000 - (i % 4) * 5_000; // 4 distinct price points
      await shipMonth(productId, qty, y, m, price);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    await refreshViews(MAKER);
  });

  afterAll(async () => {
    await prisma.priceRecommendation.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.forecast.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.reorderRule.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.receivable.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.notification.deleteMany({ where: { refType: "SalesOrder", refId: { in: created.orders } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.inventoryItem.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.edition.deleteMany({ where: { titleId: { in: created.titles } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...created.titles, ...created.products, ...created.orders] } } });
    await prisma.title.deleteMany({ where: { id: { in: created.titles } } });
    await refreshViews(MAKER);
    await prisma.$disconnect();
  });

  it("the materialized view yields >= 18 months of history", async () => {
    const h = await monthlyHistory(productId);
    expect(h.length).toBeGreaterThanOrEqual(18);
    expect(h[0].month < h[h.length - 1].month).toBe(true); // oldest first
  });

  it("refuses a forecast with under 18 months of history", async () => {
    const t = await prisma.title.create({
      data: { workTitle: "AI short", ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    created.titles.push(t.id);
    const e = await prisma.edition.create({ data: { titleId: t.id, editionNo: 1, plannedRun: 100, status: "ACTIVE" } });
    const p = await prisma.product.create({
      data: { titleId: t.id, editionId: e.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(50_000), vatRate: new Prisma.Decimal(0) },
    });
    created.products.push(p.id);
    await expect(buildForecast(p.id, MAKER)).rejects.toBeInstanceOf(ForecastError);
  });

  it("builds and persists an ensemble forecast with values + MAPE", async () => {
    if (!aiUp) return; // AI service offline → skip (graceful, not a failure)
    const f = await buildForecast(productId, MAKER, 6);
    expect(f).toBeTruthy();
    created.forecasts.push(f!.id);
    expect(f!.method).toBe("ENSEMBLE");
    expect(f!.horizonMonths).toBe(6);
    const values = f!.values as { month: string; value: number }[];
    expect(values).toHaveLength(6);
    expect(values.every((v) => typeof v.value === "number" && v.value >= 0)).toBe(true);
    expect(f!.mape).not.toBeNull(); // steady trend → a real MAPE
  });

  it("apply-to-reorder is BLOCKED on a low-confidence (high-MAPE) forecast", async () => {
    // Persist a synthetic high-MAPE forecast directly.
    const bad = await prisma.forecast.create({
      data: {
        productId,
        method: "ENSEMBLE",
        horizonMonths: 6,
        values: [{ month: "2027-01", value: 100 }] as unknown as Prisma.InputJsonValue,
        mape: new Prisma.Decimal(0.75), // 75% → LOW confidence
      },
    });
    created.forecasts.push(bad.id);
    await expect(applyForecastToReorder(bad.id, MAKER)).rejects.toBeInstanceOf(ForecastError);
    expect(await prisma.reorderRule.findUnique({ where: { productId } })).toBeNull();
  });

  it("apply-to-reorder writes a manual ROP for a confident forecast", async () => {
    const good = await prisma.forecast.create({
      data: {
        productId,
        method: "ENSEMBLE",
        horizonMonths: 6,
        values: Array.from({ length: 6 }, (_, i) => ({ month: `2027-0${i + 1}`, value: 150 })) as unknown as Prisma.InputJsonValue,
        mape: new Prisma.Decimal(0.12), // HIGH confidence
      },
    });
    created.forecasts.push(good.id);
    const rule = await applyForecastToReorder(good.id, MAKER);
    expect(rule.isAuto).toBe(false);
    expect(rule.manualROP).toBeGreaterThan(0);
  });

  it("suggests a price respecting the floor, and accepting it updates listPrice + audit (price history)", async () => {
    if (!aiUp) return;
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const res = await suggestPriceFor(productId, MAKER);
    expect(res).not.toBeNull();
    if (res!.skipped) {
      // A <3% move is a valid outcome; nothing to accept.
      expect(res!.reason).toBeTruthy();
      return;
    }
    const rec = res!.recommendation;
    created.recs.push(rec.id);
    expect(Number(rec.suggestedPrice)).toBeGreaterThanOrEqual(Number(rec.floorPrice));
    expect(rec.status).toBe("PENDING");

    const accepted = await acceptPrice(rec.id, MAKER);
    expect(accepted.status).toBe("ACCEPTED");
    const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(Number(after.listPrice)).toBe(Number(rec.suggestedPrice));
    expect(Number(after.listPrice)).not.toBe(Number(before.listPrice));

    // The audit extension recorded the price change = price history.
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Product", entityId: productId, action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("a below-floor accept is refused, and only PENDING recs can be accepted/rejected", async () => {
    const rec = await prisma.priceRecommendation.create({
      data: {
        productId,
        currentPrice: new Prisma.Decimal(100_000),
        suggestedPrice: new Prisma.Decimal(30_000),
        floorPrice: new Prisma.Decimal(54_000), // suggested < floor
        status: "PENDING",
      },
    });
    created.recs.push(rec.id);
    await expect(acceptPrice(rec.id, MAKER)).rejects.toBeInstanceOf(PricingServiceError);
    await rejectPrice(rec.id, MAKER);
    await expect(rejectPrice(rec.id, MAKER)).rejects.toBeInstanceOf(PricingServiceError);
  });

  it("gracefully degrades: forecast/pricing return null when the AI service is unreachable", async () => {
    const prev = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = "http://127.0.0.1:59999"; // nothing listening
    try {
      expect(await buildForecast(productId, MAKER)).toBeNull();
      expect(await suggestPriceFor(productId, MAKER)).toBeNull();
    } finally {
      process.env.AI_SERVICE_URL = prev;
    }
  });
});

// The action layer requires ai.apply; the RBAC assertion itself is unit-tested
// elsewhere, so here we only document that services stay permission-agnostic
// (permission is enforced in the server actions, not the service).
void AuthzError;
