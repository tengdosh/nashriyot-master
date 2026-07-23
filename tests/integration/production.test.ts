import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createPrintOrder,
  transitionPrintOrder,
  receivePrintOrder,
  PrintOrderError,
} from "@/lib/services/print-order-service";

const USER = "user-director";
const WH = "wh-tasnim-main";
const PRINTER_UZS = "partner-qamar";
const PRINTER_USD = "partner-istanbul";

let titleId = "";
let editionId = "";
let productId = "";
const orderIds: string[] = [];

async function drivePrint(order: { unitPPB: number; currency: "UZS" | "USD"; rate: number }, printerId: string, qty: number) {
  const o = await createPrintOrder(
    { editionId, productId, printerId, quantity: qty, unitPPB: order.unitPPB, fixedCost: 0, currency: order.currency, rate: order.rate },
    USER,
  );
  orderIds.push(o.id);
  await transitionPrintOrder(o.id, "APPROVED", USER);
  await transitionPrintOrder(o.id, "PRINTING", USER);
  return o.id;
}

describe("M4 — print orders → FIFO stock IN", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: { workTitle: "M4 test kitob", ownerType: "OWN", entityId: "ent-tasnim", language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    titleId = t.id;
    const e = await prisma.edition.create({ data: { titleId, editionNo: 1, plannedRun: 3000, status: "PLANNED" } });
    editionId = e.id;
    const p = await prisma.product.create({
      data: { titleId, editionId, format: "PAPERBACK", listPrice: new Prisma.Decimal(120000), vatRate: new Prisma.Decimal(0) },
    });
    productId = p.id;
    // Unique (TITLE) cost that must NOT enter the print stock layer.
    await prisma.costEntry.create({
      data: { scope: "TITLE", category: "TARJIMA", titleId, amount: new Prisma.Decimal(12_000_000), currency: "UZS", rate: new Prisma.Decimal(1), amountUZS: new Prisma.Decimal(12_000_000), date: new Date() },
    });
    // Scenario for the edition with a planned print cost (PC) for variance checks.
    await prisma.plScenario.create({
      data: {
        titleId, editionId, name: "M4 plan",
        fixedCosts: [] as unknown as Prisma.InputJsonValue,
        pagesCount: 384, perPageCost: new Prisma.Decimal(95), fixedPrintCost: new Prisma.Decimal(3000),
        printRun: 3000, sellThroughRate: new Prisma.Decimal(0.8), discountRate: new Prisma.Decimal(0.45),
        royaltyRate: new Prisma.Decimal(0.1), targetMargin: new Prisma.Decimal(0.2),
        results: { pc: 39480 } as unknown as Prisma.InputJsonValue,
      },
    });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.inventoryItem.deleteMany({ where: { productId } });
    await prisma.notification.deleteMany({ where: { refType: "PrintOrder", refId: { in: orderIds } } });
    await prisma.printOrder.deleteMany({ where: { editionId } });
    await prisma.plScenario.deleteMany({ where: { titleId } });
    await prisma.costEntry.deleteMany({ where: { titleId } });
    await prisma.product.deleteMany({ where: { titleId } });
    await prisma.edition.deleteMany({ where: { titleId } });
    await prisma.auditLog.deleteMany({ where: { entityId: titleId } });
    await prisma.title.deleteMany({ where: { id: titleId } });
    await prisma.$disconnect();
  });

  it("QABUL → stock IN layer unitCost = PRINT ONLY (no unique double-count) + QoH up", async () => {
    const id = await drivePrint({ unitPPB: 39480, currency: "UZS", rate: 1 }, PRINTER_UZS, 3000);
    const { unitCostUZS } = await receivePrintOrder(id, 3000, WH, USER);
    expect(unitCostUZS.toNumber()).toBe(39480);

    const layer = await prisma.stockMovement.findFirst({
      where: { productId, warehouseId: WH, type: "IN", refId: id },
    });
    expect(layer).toBeTruthy();
    // print only — NOT 39480 + 12,000,000 unique
    expect(Number(layer!.unitCost)).toBe(39480);
    expect(layer!.qtyRemaining).toBe(3000);

    const item = await prisma.inventoryItem.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: WH } },
    });
    expect(item!.qtyOnHand).toBe(3000);
  });

  it("two USD batches at different rates → two soʻm FIFO layers", async () => {
    const id1 = await drivePrint({ unitPPB: 3, currency: "USD", rate: 12600 }, PRINTER_USD, 1000);
    await receivePrintOrder(id1, 1000, WH, USER);
    const id2 = await drivePrint({ unitPPB: 3, currency: "USD", rate: 13100 }, PRINTER_USD, 1000);
    await receivePrintOrder(id2, 1000, WH, USER);

    const l1 = await prisma.stockMovement.findFirst({ where: { refId: id1, type: "IN" } });
    const l2 = await prisma.stockMovement.findFirst({ where: { refId: id2, type: "IN" } });
    expect(Number(l1!.unitCost)).toBe(37800); // 3 × 12600
    expect(Number(l2!.unitCost)).toBe(39300); // 3 × 13100
    expect(Number(l1!.unitCost)).not.toBe(Number(l2!.unitCost));
  });

  it("plan-vs-fact deviation >10% raises a VARIANCE notification", async () => {
    // planned PC = 39480; actual 45000 → 14% > 10%
    const id = await drivePrint({ unitPPB: 45000, currency: "UZS", rate: 1 }, PRINTER_UZS, 500);
    await receivePrintOrder(id, 500, WH, USER);
    const notif = await prisma.notification.findFirst({
      where: { type: "VARIANCE", refType: "PrintOrder", refId: id },
    });
    expect(notif).toBeTruthy();
  });

  it("receive is rejected unless status is PRINTING", async () => {
    const o = await createPrintOrder(
      { editionId, productId, printerId: PRINTER_UZS, quantity: 100, unitPPB: 100, fixedCost: 0, currency: "UZS", rate: 1 },
      USER,
    );
    orderIds.push(o.id);
    await expect(receivePrintOrder(o.id, 100, WH, USER)).rejects.toBeInstanceOf(PrintOrderError);
  });
});
