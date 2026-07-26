import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx, quantityOnHand, fourState } from "@/lib/services/inventory-service";
import {
  createTransfer,
  shipTransfer,
  receiveTransfer,
  entityLedger,
  recordSettlement,
  TransferPMinError,
  TransferServiceError,
} from "@/lib/services/transfer-service";

const USER = "user-director";
const FROM_ENTITY = "ent-tasnim";
const TO_ENTITY = "ent-sotuv";
const FROM_WH = "wh-tasnim-main";
const TO_WH = "wh-sotuv-sales";

let titleId = "";
let productId = "";
const createdProducts: string[] = [];
const createdOrders: string[] = [];
const createdSettlements: string[] = [];

async function newSku(listPrice = 100_000) {
  const p = await prisma.product.create({
    data: { titleId, editionId: null, format: "PAPERBACK", listPrice: new Prisma.Decimal(listPrice), vatRate: new Prisma.Decimal(0) },
  });
  createdProducts.push(p.id);
  return p.id;
}

async function make(input: Parameters<typeof createTransfer>[0]) {
  const r = await createTransfer(input, USER);
  createdOrders.push(r.order.id);
  return r;
}

describe("M13 — sub'ektlararo transfer va ichki savdo", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: { workTitle: "M13 test kitob", ownerType: "OWN", entityId: FROM_ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    titleId = t.id;
    await prisma.edition.create({ data: { titleId, editionNo: 1, plannedRun: 5000, status: "ACTIVE" } });
  });

  beforeEach(async () => {
    productId = await newSku();
  });

  afterAll(async () => {
    const productId = { in: createdProducts };
    await prisma.transferOrderLine.deleteMany({ where: { transferOrderId: { in: createdOrders } } });
    await prisma.transferOrder.deleteMany({ where: { id: { in: createdOrders } } });
    await prisma.entitySettlement.deleteMany({ where: { id: { in: createdSettlements } } });
    await prisma.notification.deleteMany({ where: { OR: [{ refType: "TransferOrder", refId: { in: createdOrders } }, { refType: "Product", refId: { in: createdProducts } }] } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.inventoryItem.deleteMany({ where: { productId } });
    await prisma.dailyUnitCost.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
    await prisma.edition.deleteMany({ where: { titleId } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [titleId, ...createdProducts, ...createdOrders] } } });
    await prisma.title.deleteMany({ where: { id: titleId } });
    await prisma.$disconnect();
  });

  it("create seals transferPrice = base × (1 − discount) with the suggested source", async () => {
    await stockInTx({ productId, warehouseId: FROM_WH, qty: 500, unitCostUZS: 30_000 }, USER);
    const { order, lines } = await make({
      fromEntityId: FROM_ENTITY,
      toEntityId: TO_ENTITY,
      fromWarehouseId: FROM_WH,
      toWarehouseId: TO_WH,
      lines: [{ productId, qty: 100 }], // no manual discount → engine
    });
    // Seeded rules: no partner, entity ent-sotuv not a TITLE/ENTITY match, qty 100
    // → VOLUME rule (>=50) 12%. transferPrice = 100 000 × 0.88 = 88 000.
    expect(lines[0].source).toBe("VOLUME");
    expect(Number(order.lines[0].discountRate)).toBe(0.12);
    expect(Number(order.lines[0].transferPrice)).toBe(88_000);
    expect(Number(order.lines[0].basePrice)).toBe(100_000);
  });

  it("P_min violation blocks; admin override passes and is notified", async () => {
    await stockInTx({ productId, warehouseId: FROM_WH, qty: 100, unitCostUZS: 90_000 }, USER);
    // Floor = P_min over FIFO 90 000 = 90 000. A 90% discount → transferPrice 10 000 < floor.
    const bad = {
      fromEntityId: FROM_ENTITY, toEntityId: TO_ENTITY, fromWarehouseId: FROM_WH, toWarehouseId: TO_WH,
      lines: [{ productId, qty: 10, discountRate: 0.9 }],
    };
    await expect(createTransfer(bad, USER)).rejects.toBeInstanceOf(TransferPMinError);

    const { order } = await make({ ...bad, overridePMin: true });
    expect(order.id).toBeTruthy();
    const notif = await prisma.notification.findFirst({ where: { refType: "TransferOrder", refId: order.id } });
    expect(notif).toBeTruthy();
  });

  it("🏆 RECEIVE: sender FIFO OUT + receiver new layer at transferPrice (new cost basis)", async () => {
    await stockInTx({ productId, warehouseId: FROM_WH, qty: 300, unitCostUZS: 30_000 }, USER);
    const { order } = await make({
      fromEntityId: FROM_ENTITY, toEntityId: TO_ENTITY, fromWarehouseId: FROM_WH, toWarehouseId: TO_WH,
      lines: [{ productId, qty: 100, discountRate: 0.2 }], // transferPrice = 80 000
    });
    await shipTransfer(order.id, USER);
    await receiveTransfer(order.id, { fromWarehouseId: FROM_WH, toWarehouseId: TO_WH }, USER);

    // Sender: 200 left, and it counts as sold (OUT).
    const fromItem = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: FROM_WH } },
    });
    expect(fromItem.qtyOnHand).toBe(200);

    // Receiver: 100 on hand, FIFO layer at the NEW cost basis 80 000 (not 30 000).
    const toItem = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productId_warehouseId: { productId, warehouseId: TO_WH } },
    });
    expect(toItem.qtyOnHand).toBe(100);
    const layer = await prisma.stockMovement.findFirst({
      where: { productId, warehouseId: TO_WH, type: "IN", refId: order.id },
    });
    expect(Number(layer!.unitCost)).toBe(80_000);
    expect(layer!.qtyRemaining).toBe(100);

    const st = await fourState(productId);
    expect(st.sotilgan).toBe(100); // sender OUT counts as a sale
    expect(await quantityOnHand(productId)).toBe(300); // 200 sender + 100 receiver
  });

  it("illegal transitions are refused", async () => {
    await stockInTx({ productId, warehouseId: FROM_WH, qty: 50, unitCostUZS: 30_000 }, USER);
    const { order } = await make({
      fromEntityId: FROM_ENTITY, toEntityId: TO_ENTITY, fromWarehouseId: FROM_WH, toWarehouseId: TO_WH,
      lines: [{ productId, qty: 10, discountRate: 0.2 }],
    });
    // Cannot receive before shipping.
    await expect(receiveTransfer(order.id, { fromWarehouseId: FROM_WH, toWarehouseId: TO_WH }, USER)).rejects.toBeInstanceOf(TransferServiceError);
  });

  it("ledger: receiver owes sender Σ transferPrice×qty, reduced by a settlement", async () => {
    await stockInTx({ productId, warehouseId: FROM_WH, qty: 200, unitCostUZS: 30_000 }, USER);
    const { order } = await make({
      fromEntityId: FROM_ENTITY, toEntityId: TO_ENTITY, fromWarehouseId: FROM_WH, toWarehouseId: TO_WH,
      lines: [{ productId, qty: 100, discountRate: 0.2 }], // transferPrice 80 000 → 8 000 000
    });
    await shipTransfer(order.id, USER);
    await receiveTransfer(order.id, { fromWarehouseId: FROM_WH, toWarehouseId: TO_WH }, USER);

    let ledger = await entityLedger();
    let row = ledger.find((l) => l.creditorId === FROM_ENTITY && l.debtorId === TO_ENTITY);
    expect(row).toBeTruthy();
    expect(row!.amount.gte(8_000_000)).toBe(true);
    const before = row!.amount;

    // Sotuv pays Tasnim back 3 000 000.
    const s = await recordSettlement({ fromEntityId: TO_ENTITY, toEntityId: FROM_ENTITY, amountUZS: 3_000_000, note: "qisman" }, USER);
    createdSettlements.push(s.id);

    ledger = await entityLedger();
    row = ledger.find((l) => l.creditorId === FROM_ENTITY && l.debtorId === TO_ENTITY);
    expect(row!.amount.toNumber()).toBe(before.minus(3_000_000).toNumber());
  });
});
