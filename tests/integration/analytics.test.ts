import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import { createSalesOrder, confirmSalesOrder, shipSalesOrder } from "@/lib/services/sales-service";
import {
  refreshViews,
  constructorQuery,
  pnlByEntity,
  channelProfitability,
  topTitles,
  forecastAccuracy,
} from "@/lib/services/analytics-service";

const MAKER = "user-sales";
const MAIN = "wh-tasnim-main";
const OWN_STORE = "chan-ownstore"; // 0% discount, 0 fee → net == list
const MARKETPLACE = "chan-marketplace"; // 40% default, 5% fee
const ENTITY = "ent-tasnim";

const created = { titles: [] as string[], products: [] as string[], orders: [] as string[], forecasts: [] as string[], costs: [] as string[] };

async function newTitle(name: string) {
  const t = await prisma.title.create({
    data: { workTitle: name, ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
  });
  created.titles.push(t.id);
  return t.id;
}
async function newProduct(titleId: string, listPrice: number) {
  const e = await prisma.edition.create({ data: { titleId, editionNo: 1, plannedRun: 10_000, status: "ACTIVE" } });
  const p = await prisma.product.create({
    data: { titleId, editionId: e.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(listPrice), vatRate: new Prisma.Decimal(0) },
  });
  created.products.push(p.id);
  return p.id;
}
async function shipInto(pid: string, qty: number, when: Date, price: number, channel = OWN_STORE, discount = 0) {
  await stockInTx({ productId: pid, warehouseId: MAIN, qty, unitCostUZS: 30_000 }, MAKER);
  const { order } = await createSalesOrder(
    { channelId: channel, entityId: ENTITY, warehouseId: MAIN, customerName: "Analitika testi", lines: [{ productId: pid, qty, unitPrice: price, discountRate: discount }] },
    MAKER,
  );
  created.orders.push(order.id);
  await confirmSalesOrder(order.id, MAKER);
  await shipSalesOrder(order.id, MAKER);
  await prisma.salesOrder.update({ where: { id: order.id }, data: { shippedDate: when } });
  return order.id;
}

let titleA = "";
let titleB = "";
let prodA = "";
let prodB = "";

describe("M9 — analitika (materialized view'lar + P&L)", () => {
  beforeAll(async () => {
    titleA = await newTitle("ANALYTICS Kitob A");
    titleB = await newTitle("ANALYTICS Kitob B");
    prodA = await newProduct(titleA, 100_000);
    prodB = await newProduct(titleB, 50_000);

    // A: 100 in 2026-01 (own store, no fee), 50 in 2026-02.
    await shipInto(prodA, 100, new Date("2026-01-15T00:00:00Z"), 100_000);
    await shipInto(prodA, 50, new Date("2026-02-15T00:00:00Z"), 100_000);
    // B: 200 in 2026-01 via marketplace (40% discount, 5% fee).
    await shipInto(prodB, 200, new Date("2026-01-20T00:00:00Z"), 50_000, MARKETPLACE, 0.4);

    // A FIXED cost for the P&L.
    const cost = await prisma.costEntry.create({
      data: {
        scope: "FIXED", category: "IJARA", entityId: ENTITY,
        amount: new Prisma.Decimal(2_000_000), currency: "UZS", rate: new Prisma.Decimal(1),
        amountUZS: new Prisma.Decimal(2_000_000), date: new Date("2026-01-31T00:00:00Z"),
      },
    });
    created.costs.push(cost.id);

    // A forecast for A to exercise MAPE (actual jan=100, feb=50).
    const fc = await prisma.forecast.create({
      data: {
        productId: prodA, method: "MOVING_AVERAGE", horizonMonths: 2,
        values: [{ month: "2026-01", value: 110 }, { month: "2026-02", value: 45 }] as unknown as Prisma.InputJsonValue,
        mape: new Prisma.Decimal(0.1),
      },
    });
    created.forecasts.push(fc.id);

    await refreshViews(MAKER);
  });

  afterAll(async () => {
    await prisma.forecast.deleteMany({ where: { id: { in: created.forecasts } } });
    await prisma.costEntry.deleteMany({ where: { id: { in: created.costs } } });
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
    await refreshViews(MAKER); // leave the views clean for other suites
    await prisma.$disconnect();
  });

  it("mv_monthly_sales reflects the SEALED net/cogs after refresh", async () => {
    const rows = await prisma.$queryRaw<{ month: string; net_revenue: string; cogs: string; units: number }[]>`
      SELECT month, net_revenue::text AS net_revenue, cogs::text AS cogs, units
      FROM mv_monthly_sales WHERE "productId" = ${prodA} ORDER BY month
    `;
    expect(rows).toHaveLength(2);
    // Jan: 100 × 100 000 (own store, no discount/fee) = 10 000 000 net.
    expect(Number(rows[0].net_revenue)).toBe(10_000_000);
    expect(rows[0].units).toBe(100);
    expect(Number(rows[0].cogs)).toBe(3_000_000); // 100 × 30 000
    // Feb: 50 × 100 000 = 5 000 000.
    expect(Number(rows[1].net_revenue)).toBe(5_000_000);

    // Marketplace B: 200 × 50 000 × 0.6 × 0.95 = 5 700 000 net.
    const b = await prisma.$queryRaw<{ net_revenue: string }[]>`
      SELECT net_revenue::text AS net_revenue FROM mv_monthly_sales WHERE "productId" = ${prodB}
    `;
    expect(Number(b[0].net_revenue)).toBe(5_700_000);
  });

  it("constructor pivots revenue by title × month with totals", async () => {
    const { pivot } = await constructorQuery({
      measure: "revenue",
      dimension: "title",
      secondaryDimension: "month",
      from: "2026-01",
      to: "2026-12",
    });
    const rowA = pivot.rows.find((r) => r.key === "ANALYTICS Kitob A")!;
    expect(rowA.cells["2026-01"].toNumber()).toBe(10_000_000);
    expect(rowA.cells["2026-02"].toNumber()).toBe(5_000_000);
    expect(rowA.total.toNumber()).toBe(15_000_000);
    // Grand total = A(15m) + B(5.7m) = 20.7m.
    expect(pivot.grandTotal.toNumber()).toBe(20_700_000);
  });

  it("constructor honours the period window", async () => {
    const { pivot } = await constructorQuery({
      measure: "units",
      dimension: "title",
      from: "2026-02",
      to: "2026-02",
    });
    // Only A's February 50 units fall in the window.
    expect(pivot.grandTotal.toNumber()).toBe(50);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0].key).toBe("ANALYTICS Kitob A");
  });

  it("channel profitability splits net/CM by channel", async () => {
    const rows = await channelProfitability();
    const own = rows.find((r) => r.channel === "O'z do'koni");
    const mkt = rows.find((r) => r.channel === "Marketpleys");
    expect(own).toBeTruthy();
    expect(mkt).toBeTruthy();
    // Own store net = 15m ; CM = 15m − 4.5m cogs = 10.5m.
    expect(own!.netRevenue.toNumber()).toBe(15_000_000);
    expect(own!.cm.toNumber()).toBe(10_500_000);
    // Marketplace CM = 5.7m − 6m cogs = −300 000 (a real loss the report shows).
    expect(mkt!.cm.toNumber()).toBe(-300_000);
    expect(mkt!.cmRate.toNumber()).toBeCloseTo(-0.0526, 3);
  });

  it("top titles rank by net revenue", async () => {
    const top = await topTitles(10);
    const names = top.map((t) => t.item.work_title);
    expect(names.indexOf("ANALYTICS Kitob A")).toBeLessThan(names.indexOf("ANALYTICS Kitob B"));
    expect(top[names.indexOf("ANALYTICS Kitob A")].value.toNumber()).toBe(15_000_000);
  });

  it("P&L by entity reconciles revenue − COGS − royalty − fixed, with a Jami row", async () => {
    const { rows, total } = await pnlByEntity("2026-01", "2026-12");
    const tasnim = rows.find((r) => r.entityId === ENTITY)!;
    // Tasnim revenue = A(15m) + B(5.7m) = 20.7m ; cogs = 4.5m + 6m = 10.5m.
    expect(tasnim.revenue.toNumber()).toBe(20_700_000);
    expect(tasnim.cogs.toNumber()).toBe(10_500_000);
    expect(tasnim.grossProfit.toNumber()).toBe(10_200_000);
    // No royalty (no ROYALTY contracts here); fixed = 2m.
    expect(tasnim.fixedCosts.toNumber()).toBe(2_000_000);
    expect(tasnim.netProfit.toNumber()).toBe(8_200_000);
    expect(tasnim.netMargin.toNumber()).toBeCloseTo(0.3961, 3);
    // Jami totals include every entity; Tasnim is the only one with data.
    expect(total.netProfit.toNumber()).toBe(8_200_000);
    expect(total.entityName).toBe("Jami");
  });

  it("forecast accuracy computes MAPE against actual monthly units", async () => {
    const acc = await forecastAccuracy();
    const a = acc.find((r) => r.productId === prodA)!;
    expect(a).toBeTruthy();
    // |110-100|/100 = 0.10 ; |45-50|/50 = 0.10 → MAPE 0.10.
    expect(a.mape).toBeCloseTo(0.1, 6);
  });
});
