import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx, quantityOnHand, fourState } from "@/lib/services/inventory-service";
import {
  createSalesOrder,
  confirmSalesOrder,
  shipSalesOrder,
  invoiceSalesOrder,
  cancelSalesOrder,
  getSalesOrder,
  outstandingForPartner,
  SalesOrderError,
  PMinViolationError,
  CreditLimitError,
} from "@/lib/services/sales-service";
import { createReturn, netSalesByProduct, ReturnError } from "@/lib/services/returns-service";
import {
  agingReport,
  registerPayment,
  runArOverdueScan,
  ReceivableError,
} from "@/lib/services/receivables-service";
import { recalcAbc } from "@/lib/services/reorder-service";

const USER = "user-sales";
const MAIN = "wh-tasnim-main";
const RETAIL = "chan-retail"; // 35% default, fee 0, term 0
const MARKETPLACE = "chan-marketplace"; // 40% default, fee 5%, term 15
const DISTRIBUTOR = "chan-distributor"; // 55% default, fee 0, term 30
const ENTITY = "ent-tasnim";
const CLIENT = "partner-client-1"; // PARTNER rule 15%, creditLimit 20 mln

let titleId = "";
let editionId = "";
let contributorId = "";
let productId = "";
const createdProducts: string[] = [];
const createdOrders: string[] = [];

async function newSku(listPrice = 217_400) {
  const p = await prisma.product.create({
    data: {
      titleId,
      editionId,
      format: "PAPERBACK",
      listPrice: new Prisma.Decimal(listPrice),
      vatRate: new Prisma.Decimal(0),
    },
  });
  createdProducts.push(p.id);
  return p.id;
}

/** Put `qty` copies on hand at `unitCost` so FIFO has something to consume. */
async function stock(pid: string, qty: number, unitCost: number) {
  await stockInTx({ productId: pid, warehouseId: MAIN, qty, unitCostUZS: unitCost }, USER);
}

async function order(input: Parameters<typeof createSalesOrder>[0]) {
  const r = await createSalesOrder(input, USER);
  createdOrders.push(r.order.id);
  return r;
}

describe("M6 — sotuv, marja, AR", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: {
        workTitle: "M6 test kitob",
        ownerType: "OWN",
        entityId: ENTITY,
        language: "uz",
        keywords: [],
        themaCodes: [],
        bisacCodes: [],
      },
    });
    titleId = t.id;
    const e = await prisma.edition.create({
      data: { titleId, editionNo: 1, plannedRun: 3000, status: "ACTIVE" },
    });
    editionId = e.id;
    const c = await prisma.contributor.create({
      data: { fullName: "M6 test muallif", role: "AUTHOR" },
    });
    contributorId = c.id;
  });

  beforeEach(async () => {
    productId = await newSku();
  });

  afterAll(async () => {
    const productId = { in: createdProducts };
    await prisma.return.deleteMany({ where: { orderLine: { productId } } });
    await prisma.payment.deleteMany({ where: { refType: "SalesOrder", refId: { in: createdOrders } } });
    await prisma.receivable.deleteMany({ where: { orderId: { in: createdOrders } } });
    await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: createdOrders } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: createdOrders } } });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { refType: "SalesOrder", refId: { in: createdOrders } },
          { refType: "Product", refId: { in: createdProducts } },
        ],
      },
    });
    await prisma.deadStockFlag.deleteMany({ where: { productId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.inventoryItem.deleteMany({ where: { productId } });
    await prisma.contract.deleteMany({ where: { titleId } });
    await prisma.contributor.deleteMany({ where: { id: contributorId } });
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
    await prisma.edition.deleteMany({ where: { titleId } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [titleId, ...createdProducts, ...createdOrders] } } });
    await prisma.title.deleteMany({ where: { id: titleId } });
    await prisma.$disconnect();
  });

  // ── Discount sealing ────────────────────────────────────────────────────────
  it("discount comes from the rule ladder and is SEALED on the line with its source", async () => {
    await stock(productId, 500, 54_350);

    // Partner rule (15%) beats the volume rule (12%) and the channel default.
    const withPartner = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      partnerId: CLIENT,
      lines: [{ productId, qty: 100 }],
    });
    expect(withPartner.lines[0].discountSource).toBe("PARTNER");
    expect(Number(withPartner.order.lines[0].discountRate)).toBe(0.15);

    // No partner → the VOLUME rule (qty ≥ 50) at 12%.
    const volume = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      customerName: "Naqd mijoz",
      lines: [{ productId, qty: 60 }],
    });
    expect(volume.lines[0].discountSource).toBe("VOLUME");
    expect(Number(volume.order.lines[0].discountRate)).toBe(0.12);

    // Small qty, no partner → DEFAULT rule 10%.
    const small = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 2 }],
    });
    expect(small.lines[0].discountSource).toBe("DEFAULT");
    expect(Number(small.order.lines[0].discountRate)).toBe(0.1);

    // An explicitly passed discount is honoured and marked MANUAL.
    const manual = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 2, discountRate: 0.2 }],
    });
    expect(manual.lines[0].discountSource).toBe("MANUAL");
    expect(Number(manual.order.lines[0].discountRate)).toBe(0.2);
  });

  it("changing a discount rule later does NOT move an existing document", async () => {
    await stock(productId, 100, 54_350);
    const { order: o } = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      partnerId: CLIENT,
      lines: [{ productId, qty: 10 }],
    });
    expect(Number(o.lines[0].discountRate)).toBe(0.15);

    await prisma.discountRule.update({ where: { id: "rule-partner" }, data: { rate: new Prisma.Decimal(0.5) } });
    try {
      const reread = await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: o.lines[0].id } });
      expect(Number(reread.discountRate)).toBe(0.15); // sealed, untouched
    } finally {
      await prisma.discountRule.update({
        where: { id: "rule-partner" },
        data: { rate: new Prisma.Decimal(0.15) },
      });
    }
  });

  // ── P_min floor ─────────────────────────────────────────────────────────────
  it("P_min violation is a hard block; an admin override passes and is notified", async () => {
    await stock(productId, 100, 54_350);

    // 80% discount on 217 400 → P_min = 54 350 / 0.20 = 271 750 > 217 400.
    const bad = {
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 5, discountRate: 0.8 }],
    };
    await expect(createSalesOrder(bad, USER)).rejects.toBeInstanceOf(PMinViolationError);

    const overridden = await order({ ...bad, overridePMin: true });
    expect(overridden.order.id).toBeTruthy();
    const notif = await prisma.notification.findFirst({
      where: { refType: "SalesOrder", refId: overridden.order.id, title: { contains: "P_min" } },
    });
    expect(notif).toBeTruthy();
    expect(notif!.severity).toBe("WARNING");
  });

  // ── CONFIRMED: reserve + credit limit ───────────────────────────────────────
  it("CONFIRMED reserves stock without moving it", async () => {
    await stock(productId, 200, 54_350);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 50 }],
    });

    await confirmSalesOrder(o.id, USER);
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: MAIN } },
    });
    expect(item.qtyOnHand).toBe(200); // nothing shipped yet
    expect(item.qtyReserved).toBe(50);
    expect((await fourState(productId)).sotilgan).toBe(0);
  });

  it("CONFIRMED refuses more than is available (reservations count)", async () => {
    await stock(productId, 60, 54_350);
    const a = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 50 }],
    });
    const b = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 50 }],
    });
    await confirmSalesOrder(a.order.id, USER);
    // Only 10 left unreserved.
    await expect(confirmSalesOrder(b.order.id, USER)).rejects.toBeInstanceOf(SalesOrderError);
  });

  it("credit limit is enforced at CONFIRMED against open AR", async () => {
    await stock(productId, 1000, 54_350);
    // Client limit is 20 mln. At 55% distributor discount the net unit is
    // 97 830, so 300 copies ≈ 29.3 mln — over the limit on its own.
    const { order: o } = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      partnerId: CLIENT,
      lines: [{ productId, qty: 300, discountRate: 0.55 }],
    });
    await expect(confirmSalesOrder(o.id, USER)).rejects.toBeInstanceOf(CreditLimitError);

    const notif = await prisma.notification.findFirst({
      where: { type: "CREDIT_LIMIT", refType: "SalesOrder", refId: o.id },
    });
    expect(notif).toBeTruthy();
    expect(notif!.severity).toBe("CRITICAL");
    // Nothing was reserved by the failed confirm.
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: MAIN } },
    });
    expect(item.qtyReserved).toBe(0);
  });

  it("a blocked partner cannot be confirmed at all", async () => {
    await stock(productId, 100, 54_350);
    await prisma.partner.update({ where: { id: "partner-client-2" }, data: { isBlocked: true } });
    try {
      const { order: o } = await order({
        channelId: RETAIL,
        entityId: ENTITY,
        warehouseId: MAIN,
        partnerId: "partner-client-2",
        lines: [{ productId, qty: 1 }],
      });
      await expect(confirmSalesOrder(o.id, USER)).rejects.toBeInstanceOf(CreditLimitError);
    } finally {
      await prisma.partner.update({ where: { id: "partner-client-2" }, data: { isBlocked: false } });
    }
  });

  // ── SHIPPED: FIFO + sealed CM ───────────────────────────────────────────────
  it("🏆 GOLDEN: SHIPPED consumes FIFO and SEALS cogsUnit 54 350 / cmUnit 43 480", async () => {
    await stock(productId, 200, 54_350);
    // 10% royalty contract → royaltyEst = 21 740 per copy on a 217 400 list.
    const contract = await prisma.contract.create({
      data: {
        contributorId,
        titleId,
        type: "ROYALTY",
        status: "ACTIVE",
        reserveRate: new Prisma.Decimal(0.15),
        tiers: { create: [{ fromUnits: 0, rate: new Prisma.Decimal(0.1), basis: "LIST" }] },
      },
    });

    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 100, discountRate: 0.45 }],
    });
    await confirmSalesOrder(o.id, USER);
    const { sealed } = await shipSalesOrder(o.id, USER);

    expect(sealed).toHaveLength(1);
    expect(sealed[0].cogsUnit.toNumber()).toBe(54_350);
    // net 119 570 − cogs 54 350 − royalti 21 740 = 43 480
    expect(sealed[0].cmUnit.toNumber()).toBe(43_480);

    const line = await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: o.lines[0].id } });
    expect(Number(line.cogsUnit)).toBe(54_350);
    expect(Number(line.cmUnit)).toBe(43_480);

    // Stock left, reservation released, and it IS a sale this time.
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: MAIN } },
    });
    expect(item.qtyOnHand).toBe(100);
    expect(item.qtyReserved).toBe(0);
    expect((await fourState(productId)).sotilgan).toBe(100);

    await prisma.contract.delete({ where: { id: contract.id } });
  });

  it("a BUYOUT contract adds no per-copy royalty (it is already a title cost)", async () => {
    await stock(productId, 100, 40_000);
    const contract = await prisma.contract.create({
      data: {
        contributorId,
        titleId,
        type: "BUYOUT",
        status: "ACTIVE",
        buyoutAmount: new Prisma.Decimal(18_000_000),
      },
    });
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 10, unitPrice: 100_000, discountRate: 0 }],
    });
    await confirmSalesOrder(o.id, USER);
    const { sealed } = await shipSalesOrder(o.id, USER);
    expect(sealed[0].cmUnit.toNumber()).toBe(60_000); // 100 000 − 40 000, no royalty
    await prisma.contract.delete({ where: { id: contract.id } });
  });

  it("marketplace fee comes off the discounted price and lowers the sealed CM", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: MARKETPLACE,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 10, unitPrice: 100_000, discountRate: 0.4 }],
    });
    await confirmSalesOrder(o.id, USER);
    const { sealed } = await shipSalesOrder(o.id, USER);
    // 60 000 discounted − 3 000 fee (5%) = 57 000 net − 40 000 cogs = 17 000
    expect(sealed[0].cmUnit.toNumber()).toBe(17_000);
  });

  it("raising the channel fee AFTER ship never rewrites a sealed margin", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: MARKETPLACE,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 10, unitPrice: 100_000, discountRate: 0.4 }],
    });
    await confirmSalesOrder(o.id, USER);
    await shipSalesOrder(o.id, USER);

    await prisma.salesChannel.update({
      where: { id: MARKETPLACE },
      data: { feeRate: new Prisma.Decimal(0.3) },
    });
    try {
      const line = await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: o.lines[0].id } });
      expect(Number(line.cmUnit)).toBe(17_000); // still the shipped-day number
    } finally {
      await prisma.salesChannel.update({
        where: { id: MARKETPLACE },
        data: { feeRate: new Prisma.Decimal(0.05) },
      });
    }
  });

  it("delivery cost per unit is carried into the sealed CM (retail)", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      deliveryProvider: "BTS",
      lines: [{ productId, qty: 5, unitPrice: 100_000, discountRate: 0, deliveryCostUnit: 15_000 }],
    });
    await confirmSalesOrder(o.id, USER);
    const { sealed } = await shipSalesOrder(o.id, USER);
    expect(sealed[0].cmUnit.toNumber()).toBe(45_000);
  });

  // ── State machine guards ────────────────────────────────────────────────────
  it("illegal transitions are refused and shipped goods cannot be cancelled", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 5 }],
    });
    // Cannot ship straight from DRAFT.
    await expect(shipSalesOrder(o.id, USER)).rejects.toBeInstanceOf(SalesOrderError);
    await confirmSalesOrder(o.id, USER);
    // Cannot invoice before shipping.
    await expect(invoiceSalesOrder(o.id, USER)).rejects.toBeInstanceOf(SalesOrderError);
    await shipSalesOrder(o.id, USER);
    await expect(cancelSalesOrder(o.id, USER)).rejects.toBeInstanceOf(SalesOrderError);
  });

  it("CANCELLED releases the reservation", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 30 }],
    });
    await confirmSalesOrder(o.id, USER);
    await cancelSalesOrder(o.id, USER);
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: MAIN } },
    });
    expect(item.qtyReserved).toBe(0);
    expect(item.qtyOnHand).toBe(100);
  });

  // ── AR ──────────────────────────────────────────────────────────────────────
  it("INVOICED opens AR at the SEALED net; payments close it and drive the order to PAID", async () => {
    await stock(productId, 500, 40_000);
    const { order: o } = await order({
      channelId: DISTRIBUTOR, // 30-day term
      entityId: ENTITY,
      warehouseId: MAIN,
      partnerId: "partner-client-3",
      lines: [{ productId, qty: 100, unitPrice: 100_000, discountRate: 0.5 }],
    });
    await confirmSalesOrder(o.id, USER);
    await shipSalesOrder(o.id, USER);
    await invoiceSalesOrder(o.id, USER);

    const ar = await prisma.receivable.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(Number(ar.amountUZS)).toBe(5_000_000); // 100 × 50 000 net
    expect(ar.status).toBe("OPEN");
    expect(ar.dueDate).toBeTruthy();
    const termDays = Math.round((ar.dueDate!.getTime() - Date.now()) / 86_400_000);
    expect(termDays).toBeGreaterThanOrEqual(29);
    expect(termDays).toBeLessThanOrEqual(30);

    expect((await outstandingForPartner("partner-client-3")).toNumber()).toBeGreaterThanOrEqual(5_000_000);

    // Overpayment is refused outright.
    await expect(
      registerPayment({ receivableId: ar.id, amountUZS: 5_000_001, method: "BANK" }, USER),
    ).rejects.toBeInstanceOf(ReceivableError);

    const partial = await registerPayment(
      { receivableId: ar.id, amountUZS: 2_000_000, method: "BANK" },
      USER,
    );
    expect(partial.status).toBe("PARTIAL");
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("INVOICED");

    const full = await registerPayment({ receivableId: ar.id, amountUZS: 3_000_000, method: "CASH" }, USER);
    expect(full.status).toBe("PAID");
    const reread = await prisma.salesOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(reread.status).toBe("PAID");
    expect(reread.paidDate).toBeTruthy();

    // Two payments recorded, both inbound.
    const payments = await prisma.payment.findMany({ where: { refType: "SalesOrder", refId: o.id } });
    expect(payments).toHaveLength(2);
    expect(payments.every((p) => p.direction === "IN")).toBe(true);

    // A settled debt leaves the aging report entirely.
    const { rows } = await agingReport();
    expect(rows.find((r) => r.orderId === o.id)).toBeUndefined();

    await expect(
      registerPayment({ receivableId: ar.id, amountUZS: 1, method: "BANK" }, USER),
    ).rejects.toBeInstanceOf(ReceivableError);
  });

  it("AR aging buckets the debt and the nightly job alerts once per receivable", async () => {
    await stock(productId, 500, 40_000);
    const { order: o } = await order({
      channelId: DISTRIBUTOR,
      entityId: ENTITY,
      warehouseId: MAIN,
      partnerId: "partner-client-3",
      lines: [{ productId, qty: 10, unitPrice: 100_000, discountRate: 0.5 }],
    });
    await confirmSalesOrder(o.id, USER);
    await shipSalesOrder(o.id, USER);
    await invoiceSalesOrder(o.id, USER);

    const ar = await prisma.receivable.findUniqueOrThrow({ where: { orderId: o.id } });
    // Backdate the due date to 95 days ago → the 90+ bucket.
    await prisma.receivable.update({
      where: { id: ar.id },
      data: { dueDate: new Date(Date.now() - 95 * 86_400_000) },
    });

    const { rows, summary } = await agingReport();
    const row = rows.find((r) => r.orderId === o.id)!;
    expect(row.bucket).toBe("D90_PLUS");
    expect(row.outstandingUZS.toNumber()).toBe(500_000);
    expect(summary.buckets.D90_PLUS.gte(500_000)).toBe(true);
    expect(summary.overdue.gte(500_000)).toBe(true);

    const first = await runArOverdueScan({ userId: USER });
    expect(first.alerts).toBeGreaterThanOrEqual(1);
    const notif = await prisma.notification.findFirst({
      where: { type: "AR_OVERDUE", refType: "Receivable", refId: ar.id },
    });
    expect(notif).toBeTruthy();
    expect(notif!.severity).toBe("CRITICAL");
    expect(notif!.linkUrl).toBe("/sales/receivables");

    // Re-running the job must not pile up duplicate alerts for the same debt.
    const before = await prisma.notification.count({
      where: { type: "AR_OVERDUE", refType: "Receivable", refId: ar.id },
    });
    await runArOverdueScan({ userId: USER });
    const after = await prisma.notification.count({
      where: { type: "AR_OVERDUE", refType: "Receivable", refId: ar.id },
    });
    expect(after).toBe(before);

    await prisma.notification.deleteMany({ where: { refType: "Receivable", refId: ar.id } });
  });

  // ── Returns ─────────────────────────────────────────────────────────────────
  it("SELLABLE return goes back on hand and reduces period net sales", async () => {
    await stock(productId, 200, 40_000);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 100, unitPrice: 100_000, discountRate: 0 }],
    });
    await confirmSalesOrder(o.id, USER);
    await shipSalesOrder(o.id, USER);
    expect(await quantityOnHand(productId)).toBe(100);

    const lineId = o.lines[0].id;
    await createReturn({ orderLineId: lineId, qty: 20, condition: "SELLABLE" }, USER);
    expect(await quantityOnHand(productId)).toBe(120); // back on hand

    await createReturn({ orderLineId: lineId, qty: 5, condition: "DAMAGED" }, USER);
    expect(await quantityOnHand(productId)).toBe(120); // damaged does not

    const st = await fourState(productId);
    expect(st.sotilgan).toBe(100);
    expect(st.qaytgan).toBe(25);

    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const ns = (await netSalesByProduct(from, to)).find((r) => r.product.id === productId)!;
    expect(ns.units).toBe(100);
    expect(ns.returnedUnits).toBe(25);
    expect(ns.netUnits).toBe(75);
    expect(ns.revenue.toNumber()).toBe(7_500_000); // 75 × 100 000 net
    expect(ns.cm.toNumber()).toBe(4_500_000); // 75 × 60 000 sealed CM

    // The order card agrees with the journal.
    const card = await getSalesOrder(o.id);
    expect(card.lines[0].returnedQty).toBe(25);
    expect(card.lines[0].sealed).toBe(true);
  });

  it("a line cannot be over-returned, and an unshipped order cannot be returned", async () => {
    await stock(productId, 100, 40_000);
    const { order: o } = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId, qty: 10 }],
    });
    await expect(
      createReturn({ orderLineId: o.lines[0].id, qty: 1, condition: "SELLABLE" }, USER),
    ).rejects.toBeInstanceOf(ReturnError);

    await confirmSalesOrder(o.id, USER);
    await shipSalesOrder(o.id, USER);
    await createReturn({ orderLineId: o.lines[0].id, qty: 8, condition: "SELLABLE" }, USER);
    await expect(
      createReturn({ orderLineId: o.lines[0].id, qty: 3, condition: "SELLABLE" }, USER),
    ).rejects.toBeInstanceOf(ReturnError);
  });

  // ── M5 measures now read sealed sales data ──────────────────────────────────
  it("ABC now ranks on SEALED net revenue from shipped orders", async () => {
    const big = productId;
    const small = await newSku(10_000);
    await stock(big, 1000, 30_000);
    await stock(small, 1000, 3_000);

    const bigOrder = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId: big, qty: 500, unitPrice: 200_000, discountRate: 0 }],
    });
    await confirmSalesOrder(bigOrder.order.id, USER);
    await shipSalesOrder(bigOrder.order.id, USER);

    const smallOrder = await order({
      channelId: RETAIL,
      entityId: ENTITY,
      warehouseId: MAIN,
      lines: [{ productId: small, qty: 5, unitPrice: 10_000, discountRate: 0 }],
    });
    await confirmSalesOrder(smallOrder.order.id, USER);
    await shipSalesOrder(smallOrder.order.id, USER);

    const { rows } = await recalcAbc({ userId: USER });
    const bigRow = rows.find((r) => r.productId === big)!;
    const smallRow = rows.find((r) => r.productId === small)!;
    // 500 × 200 000 SEALED net — not list price × movements.
    expect(bigRow.revenue.toNumber()).toBe(100_000_000);
    expect(smallRow.revenue.toNumber()).toBe(50_000);
    expect(bigRow.abcClass).toBe("A");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: big } })).abcClass).toBe("A");
  });
});
