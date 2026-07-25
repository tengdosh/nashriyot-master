import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  stockInTx,
  fifoIssueTx,
  fifoAvgUnitCost,
  transferStock,
  giveToAgent,
  takeBackFromAgent,
  adjustStock,
  returnStock,
  fourState,
  quantityOnHand,
  lastSaleAgeDays,
  onOrderQty,
  InsufficientStockError,
  InventoryError,
} from "@/lib/services/inventory-service";
import {
  scanDeadStock,
  createWriteDown,
  approveWriteDown,
  rejectWriteDown,
  deadStockReport,
  WriteDownError,
} from "@/lib/services/dead-stock-service";
import { runRopMonitor, recalcAbc } from "@/lib/services/reorder-service";
import { AuthzError } from "@/lib/rbac";
import { INVENTORY_DEFAULTS, type InventorySettings } from "@/lib/services/inventory-settings";

const MAKER = "user-sales";
const CHECKER = "user-director";
const MAIN = "wh-tasnim-main";
const SALES = "wh-sotuv-sales";
const AGENT = "wh-agent-akmal";

const CFG: InventorySettings = {
  ...INVENTORY_DEFAULTS,
  deadStockDays: 120,
  carryingRate: 0.2,
  expectedROI: 0.25,
  minTurnover: 0.5,
  ageDiscountTiers: [
    { fromDays: 0, toDays: 90, discount: 0 },
    { fromDays: 91, toDays: 180, discount: 0.15 },
    { fromDays: 181, toDays: null, discount: 0.3 },
  ],
};

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

let titleId = "";
let editionId = "";
/** SKU under test — recreated fresh for every test so FIFO layers never leak. */
let productId = "";
const createdProducts: string[] = [];

async function newSku(listPrice = 120_000) {
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

/** Backdate a movement so age/window-based logic can be exercised. */
async function backdate(id: string, when: Date) {
  await prisma.stockMovement.update({ where: { id }, data: { date: when } });
}

describe("M5 — ombor, konsignatsiya, oʻlik zaxira", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: {
        workTitle: "M5 test kitob",
        ownerType: "OWN",
        entityId: "ent-tasnim",
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
  });

  beforeEach(async () => {
    productId = await newSku();
  });

  afterAll(async () => {
    const where = { productId: { in: createdProducts } };
    await prisma.writeDown.deleteMany({ where });
    await prisma.deadStockFlag.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.inventoryItem.deleteMany({ where });
    await prisma.reorderRule.deleteMany({ where });
    await prisma.notification.deleteMany({
      where: { refType: "Product", refId: { in: createdProducts } },
    });
    await prisma.printOrder.deleteMany({ where: { editionId } });
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
    await prisma.edition.deleteMany({ where: { titleId } });
    await prisma.auditLog.deleteMany({ where: { entityId: titleId } });
    await prisma.title.deleteMany({ where: { id: titleId } });
    await prisma.$disconnect();
  });

  // ── FIFO ────────────────────────────────────────────────────────────────────
  it("FIFO consumes the OLDEST layer first and reports the weighted COGS", async () => {
    const first = await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 30_000 }, MAKER);
    await backdate(first.id, days(10));
    await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 40_000 }, MAKER);

    // 150 units = all 100 @30 000 + 50 @40 000 = 5 000 000 ; unit = 33 333.33…
    const { cogs, cogsUnit } = await fifoIssueTx({ productId, warehouseId: MAIN, qty: 150 }, MAKER);
    expect(cogs.toNumber()).toBe(5_000_000);
    expect(cogsUnit.toNumber()).toBeCloseTo(33_333.33, 2);

    const layers = await prisma.stockMovement.findMany({
      where: { productId, warehouseId: MAIN, type: "IN" },
      orderBy: { date: "asc" },
    });
    expect(layers[0].qtyRemaining).toBe(0); // oldest fully consumed
    expect(layers[1].qtyRemaining).toBe(50); // newest partially

    const item = await prisma.inventoryItem.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: MAIN } },
    });
    expect(item!.qtyOnHand).toBe(50);
    // Remaining stock is now purely the 40 000 layer.
    expect((await fifoAvgUnitCost(productId, MAIN)).toNumber()).toBe(40_000);
  });

  it("issuing more than is on hand throws and leaves the layers untouched", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 10, unitCostUZS: 30_000 }, MAKER);
    await expect(
      fifoIssueTx({ productId, warehouseId: MAIN, qty: 11 }, MAKER),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const layer = await prisma.stockMovement.findFirst({ where: { productId, type: "IN" } });
    expect(layer!.qtyRemaining).toBe(10); // transaction rolled back
    expect(await quantityOnHand(productId)).toBe(10);
  });

  // ── Consignment / four states ───────────────────────────────────────────────
  it("giving to an agent moves cost with the copies and is NOT a sale", async () => {
    const l1 = await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 30_000 }, MAKER);
    await backdate(l1.id, days(10));
    await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 40_000 }, MAKER);

    await giveToAgent({ productId, fromWarehouseId: MAIN, agentWarehouseId: AGENT, qty: 120 }, MAKER);

    // Destination re-opens the SAME two costs: 100 @30 000 + 20 @40 000.
    const agentLayers = await prisma.stockMovement.findMany({
      where: { productId, warehouseId: AGENT, type: "IN" },
      orderBy: { unitCost: "asc" },
    });
    expect(agentLayers.map((l) => Number(l.unitCost))).toEqual([30_000, 40_000]);
    expect(agentLayers.map((l) => l.qtyRemaining)).toEqual([100, 20]);

    const st = await fourState(productId);
    expect(st.omborda).toBe(80);
    expect(st.agentda).toBe(120);
    expect(st.sotilgan).toBe(0); // a transfer must never count as sold
    expect(st.qaytgan).toBe(0);
    expect(st.omborda + st.agentda).toBe(200); // nothing created or destroyed
  });

  it("agent sells some and returns the rest; four states stay consistent", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 200, unitCostUZS: 35_000 }, MAKER);
    await giveToAgent({ productId, fromWarehouseId: MAIN, agentWarehouseId: AGENT, qty: 150 }, MAKER);
    await fifoIssueTx({ productId, warehouseId: AGENT, qty: 90 }, MAKER); // sold from consignment
    await takeBackFromAgent({ productId, agentWarehouseId: AGENT, toWarehouseId: MAIN, qty: 60 }, MAKER);

    const st = await fourState(productId);
    expect(st.agentda).toBe(0);
    expect(st.omborda).toBe(110); // 50 left behind + 60 returned
    expect(st.sotilgan).toBe(90);
    expect(st.omborda + st.sotilgan).toBe(200);
  });

  it("consignment may only go to an AGENT warehouse", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 10, unitCostUZS: 30_000 }, MAKER);
    await expect(
      giveToAgent({ productId, fromWarehouseId: MAIN, agentWarehouseId: SALES, qty: 5 }, MAKER),
    ).rejects.toBeInstanceOf(InventoryError);
  });

  it("transfer cannot overdraw the source warehouse", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 10, unitCostUZS: 30_000 }, MAKER);
    await expect(
      transferStock({ productId, fromWarehouseId: MAIN, toWarehouseId: SALES, qty: 11 }, MAKER),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  // ── ADJUST / RETURN ─────────────────────────────────────────────────────────
  it("ADJUST up reuses the weighted average; ADJUST down consumes FIFO, neither is a sale", async () => {
    const l1 = await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 30_000 }, MAKER);
    await backdate(l1.id, days(10));
    await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 40_000 }, MAKER);

    await adjustStock({ productId, warehouseId: MAIN, delta: 10, reason: "Inventarizatsiya ortiqcha" }, MAKER);
    const added = await prisma.stockMovement.findFirst({
      where: { productId, refType: "Adjust", type: "IN" },
    });
    expect(Number(added!.unitCost)).toBe(35_000); // (100×30k + 100×40k) / 200
    expect(await quantityOnHand(productId)).toBe(210);

    await adjustStock({ productId, warehouseId: MAIN, delta: -30, reason: "Yoʻqotish" }, MAKER);
    expect(await quantityOnHand(productId)).toBe(180);

    const st = await fourState(productId);
    expect(st.sotilgan).toBe(0); // ADJUST is not OUT
    expect(st.omborda).toBe(180);
  });

  it("ADJUST demands a reason and a non-zero delta", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 10, unitCostUZS: 30_000 }, MAKER);
    await expect(
      adjustStock({ productId, warehouseId: MAIN, delta: 0, reason: "sabab" }, MAKER),
    ).rejects.toBeInstanceOf(InventoryError);
    await expect(
      adjustStock({ productId, warehouseId: MAIN, delta: 5, reason: "   " }, MAKER),
    ).rejects.toBeInstanceOf(InventoryError);
  });

  it("SELLABLE return re-enters stock as a consumable layer; DAMAGED does not", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 30_000 }, MAKER);
    await fifoIssueTx({ productId, warehouseId: MAIN, qty: 40 }, MAKER);

    await returnStock({ productId, warehouseId: MAIN, qty: 10, condition: "SELLABLE" }, MAKER);
    expect(await quantityOnHand(productId)).toBe(70);

    await returnStock({ productId, warehouseId: MAIN, qty: 5, condition: "DAMAGED" }, MAKER);
    expect(await quantityOnHand(productId)).toBe(70); // damaged never goes back on hand

    const st = await fourState(productId);
    expect(st.qaytgan).toBe(15); // both are honestly counted as returned
    expect(st.sotilgan).toBe(40);

    // The sellable return is itself a FIFO layer — 60 original + 10 returned.
    await fifoIssueTx({ productId, warehouseId: MAIN, qty: 70 }, MAKER);
    expect(await quantityOnHand(productId)).toBe(0);
  });

  // ── Dead stock ──────────────────────────────────────────────────────────────
  it("🏆 GOLDEN: dead-stock scan on 820 × 50 000 @ 20% / 25% → 59 450 000", async () => {
    const layer = await stockInTx(
      { productId, warehouseId: MAIN, qty: 820, unitCostUZS: 50_000 },
      MAKER,
    );
    await backdate(layer.id, days(200)); // never sold, 200 days old → past the 120-day threshold
    expect(await lastSaleAgeDays(productId)).toBe(200);

    const res = await scanDeadStock({ userId: MAKER, settings: CFG });
    expect(res.flagged).toBeGreaterThanOrEqual(1);

    const flag = await prisma.deadStockFlag.findUniqueOrThrow({ where: { productId } });
    expect(flag.qtyOnHand).toBe(820);
    expect(Number(flag.unitCost)).toBe(50_000);
    expect(Number(flag.deadCost)).toBe(41_000_000);
    expect(Number(flag.carryingCost)).toBe(8_200_000);
    expect(Number(flag.opportunityCost)).toBe(10_250_000);
    expect(Number(flag.totalLoss)).toBe(59_450_000);
    // Settings are SEALED onto the flag.
    expect(Number(flag.carryingRate)).toBe(0.2);
    expect(Number(flag.expectedROI)).toBe(0.25);
    expect(flag.thresholdDays).toBe(120);
    expect(flag.suggestedAction).toBe("PRICE_CUT");
    expect(Number(flag.suggestedDiscount)).toBe(0.3); // 200 days → 181+ tier

    const notif = await prisma.notification.findFirst({
      where: { type: "DEAD_STOCK", refType: "Product", refId: productId },
    });
    expect(notif).toBeTruthy();
    expect(notif!.severity).toBe("CRITICAL"); // ≥ 50 mln
    expect(notif!.linkUrl).toBe("/inventory/dead-stock");

    const { totals } = await deadStockReport();
    expect(totals.total.gte(59_450_000)).toBe(true);
  });

  it("a profitable, seasonal backlist title is protected from the scanner", async () => {
    // Cheap cost vs 120 000 list price → strongly positive CM12.
    const layer = await stockInTx(
      { productId, warehouseId: MAIN, qty: 500, unitCostUZS: 20_000 },
      MAKER,
    );
    await backdate(layer.id, days(400));

    // One concentrated sales month within the last year = seasonal pattern,
    // but the last sale is still older than the 120-day threshold.
    const out = await fifoIssueTx({ productId, warehouseId: MAIN, qty: 120 }, MAKER);
    expect(out.cogsUnit.toNumber()).toBe(20_000);
    const outRow = await prisma.stockMovement.findFirst({
      where: { productId, type: "OUT" },
      orderBy: { createdAt: "desc" },
    });
    await backdate(outRow!.id, days(200));

    const res = await scanDeadStock({ userId: MAKER, settings: CFG });
    expect(res.protectedBacklist).toBeGreaterThanOrEqual(1);
    expect(await prisma.deadStockFlag.findUnique({ where: { productId } })).toBeNull();
  });

  it("a SKU that starts selling again has its flag cleared on the next scan", async () => {
    const layer = await stockInTx(
      { productId, warehouseId: MAIN, qty: 300, unitCostUZS: 50_000 },
      MAKER,
    );
    await backdate(layer.id, days(300));
    await scanDeadStock({ userId: MAKER, settings: CFG });
    expect(await prisma.deadStockFlag.findUnique({ where: { productId } })).toBeTruthy();

    await fifoIssueTx({ productId, warehouseId: MAIN, qty: 10 }, MAKER); // sold today
    const res = await scanDeadStock({ userId: MAKER, settings: CFG });
    expect(res.cleared).toBeGreaterThanOrEqual(1);
    expect(await prisma.deadStockFlag.findUnique({ where: { productId } })).toBeNull();
  });

  // ── Write-down maker-checker ────────────────────────────────────────────────
  it("write-down is maker-checker: the maker cannot approve their own", async () => {
    const layer = await stockInTx(
      { productId, warehouseId: MAIN, qty: 100, unitCostUZS: 50_000 },
      MAKER,
    );
    await backdate(layer.id, days(300));
    await scanDeadStock({ userId: MAKER, settings: CFG });

    const wd = await createWriteDown(
      { productId, warehouseId: MAIN, qty: 40, reason: "Sotilmadi — hisobdan chiqarish" },
      MAKER,
    );
    expect(Number(wd.unitCost)).toBe(50_000);
    expect(Number(wd.amountUZS)).toBe(2_000_000);
    expect(wd.status).toBe("PENDING_APPROVAL");
    // Creating it must NOT touch stock yet.
    expect(await quantityOnHand(productId)).toBe(100);

    await expect(approveWriteDown(wd.id, MAKER)).rejects.toBeInstanceOf(AuthzError);
    expect(await quantityOnHand(productId)).toBe(100);

    const approved = await approveWriteDown(wd.id, CHECKER);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(CHECKER);
    expect(await quantityOnHand(productId)).toBe(60);

    // Written off, not sold.
    const st = await fourState(productId);
    expect(st.sotilgan).toBe(0);
    const flag = await prisma.deadStockFlag.findUniqueOrThrow({ where: { productId } });
    expect(flag.status).toBe("WRITTEN_OFF");

    // Double approval is refused.
    await expect(approveWriteDown(wd.id, CHECKER)).rejects.toBeInstanceOf(WriteDownError);
  });

  it("write-down refuses more copies than are on hand; reject needs a reason", async () => {
    await stockInTx({ productId, warehouseId: MAIN, qty: 5, unitCostUZS: 50_000 }, MAKER);
    await expect(
      createWriteDown({ productId, warehouseId: MAIN, qty: 6, reason: "juda koʻp" }, MAKER),
    ).rejects.toBeInstanceOf(WriteDownError);

    const wd = await createWriteDown(
      { productId, warehouseId: MAIN, qty: 2, reason: "nuqsonli" },
      MAKER,
    );
    await expect(rejectWriteDown(wd.id, CHECKER, "  ")).rejects.toBeInstanceOf(WriteDownError);
    const rejected = await rejectWriteDown(wd.id, CHECKER, "Qaytadan koʻrib chiqing");
    expect(rejected.status).toBe("REJECTED");
    expect(await quantityOnHand(productId)).toBe(5); // rejection never touches stock
  });

  it("a WRITTEN_OFF flag is left alone by later scans", async () => {
    const layer = await stockInTx(
      { productId, warehouseId: MAIN, qty: 100, unitCostUZS: 50_000 },
      MAKER,
    );
    await backdate(layer.id, days(300));
    await scanDeadStock({ userId: MAKER, settings: CFG });
    const wd = await createWriteDown(
      { productId, warehouseId: MAIN, qty: 100, reason: "Butun partiya" },
      MAKER,
    );
    await approveWriteDown(wd.id, CHECKER);

    await scanDeadStock({ userId: MAKER, settings: CFG });
    const flag = await prisma.deadStockFlag.findUniqueOrThrow({ where: { productId } });
    expect(flag.status).toBe("WRITTEN_OFF");
    expect(flag.qtyOnHand).toBe(100); // untouched by the rescan
  });

  // ── ROP monitor + ABC ───────────────────────────────────────────────────────
  it("ROP alert fires with an EOQ suggestion when available drops below the point", async () => {
    await prisma.reorderRule.create({
      data: { productId, leadTimeDays: 25, serviceLevelZ: new Prisma.Decimal(1.65), isAuto: true },
    });
    await stockInTx({ productId, warehouseId: MAIN, qty: 3000, unitCostUZS: 40_000 }, MAKER);

    // Steady demand across the window, then drain the stock to below ROP.
    for (let i = 0; i < 12; i++) {
      const out = await fifoIssueTx({ productId, warehouseId: MAIN, qty: 60 }, MAKER);
      expect(out.cogsUnit.toNumber()).toBe(40_000);
      const row = await prisma.stockMovement.findFirst({
        where: { productId, type: "OUT" },
        orderBy: { createdAt: "desc" },
      });
      await backdate(row!.id, days(i * 7));
    }
    await adjustStock({ productId, warehouseId: MAIN, delta: -2200, reason: "Test uchun kamaytirish" }, MAKER);

    const res = await runRopMonitor({ userId: MAKER, settings: CFG });
    expect(res.alerts).toBeGreaterThanOrEqual(1);

    const notif = await prisma.notification.findFirst({
      where: { type: "ROP", refType: "Product", refId: productId },
    });
    expect(notif).toBeTruthy();
    expect(notif!.body).toMatch(/tavsiya \d+ dona \(EOQ\)/);
    expect(notif!.linkUrl).toBe("/production/print-orders");
  });

  it("no ROP nagging while a print order is already on its way", async () => {
    await prisma.reorderRule.create({
      data: { productId, leadTimeDays: 25, serviceLevelZ: new Prisma.Decimal(1.65), isAuto: true },
    });
    await stockInTx({ productId, warehouseId: MAIN, qty: 100, unitCostUZS: 40_000 }, MAKER);
    const out = await fifoIssueTx({ productId, warehouseId: MAIN, qty: 90 }, MAKER);
    expect(out.cogs.toNumber()).toBe(3_600_000);

    await prisma.printOrder.create({
      data: {
        editionId,
        productId,
        printerId: "partner-qamar",
        quantity: 2000,
        unitPPB: new Prisma.Decimal(40_000),
        fixedCost: new Prisma.Decimal(0),
        currency: "UZS",
        rate: new Prisma.Decimal(1),
        status: "PRINTING",
      },
    });
    expect(await onOrderQty(productId)).toBe(2000);

    const res = await runRopMonitor({ userId: MAKER, settings: CFG });
    expect(res.skipped).toBeGreaterThanOrEqual(1);
    const notif = await prisma.notification.findFirst({
      where: { type: "ROP", refType: "Product", refId: productId },
    });
    expect(notif).toBeNull();
  });

  it("ABC assigns the classes and persists them on the SKU", async () => {
    const big = productId;
    const small = await newSku(10_000);
    await stockInTx({ productId: big, warehouseId: MAIN, qty: 1000, unitCostUZS: 30_000 }, MAKER);
    await stockInTx({ productId: small, warehouseId: MAIN, qty: 1000, unitCostUZS: 3_000 }, MAKER);
    await fifoIssueTx({ productId: big, warehouseId: MAIN, qty: 900 }, MAKER); // 900 × 120 000
    await fifoIssueTx({ productId: small, warehouseId: MAIN, qty: 5 }, MAKER); // 5 × 10 000

    const { rows, counts } = await recalcAbc({ userId: MAKER });
    expect(counts.A).toBeGreaterThanOrEqual(1);

    const bigRow = rows.find((r) => r.productId === big)!;
    const smallRow = rows.find((r) => r.productId === small)!;
    expect(bigRow.abcClass).toBe("A");
    expect(bigRow.revenue.toNumber()).toBe(108_000_000);
    expect(smallRow.revenue.toNumber()).toBe(50_000);
    expect(smallRow.cumulative.gt(bigRow.cumulative)).toBe(true);

    const persisted = await prisma.product.findUniqueOrThrow({ where: { id: big } });
    expect(persisted.abcClass).toBe("A");
  });
});
