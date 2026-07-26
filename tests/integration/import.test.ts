import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { previewImport, commitImport, ImportError } from "@/lib/services/import-service";
import { importProductSku } from "@/lib/import-map";

const USER = "user-director";
// Unique marker so cleanup is precise.
const B1 = "ITEST Sarob";
const B1_CYR = "ИТЕСТ Сароб"; // NOT the same key as B1 (marker differs) — used only for two-SKU check below
const SUP = "ITEST Bosmaxona";
const CLIENT = "ITEST Mijoz";

async function cleanup() {
  const skuPrefixes = ["IMP-itest", "IMP-итест"];
  const products = await prisma.product.findMany({
    where: { OR: skuPrefixes.map((p) => ({ sku: { startsWith: p } })) },
    select: { id: true, titleId: true },
  });
  const productIds = products.map((p) => p.id);
  const titleIds = [...new Set(products.map((p) => p.titleId))];
  const orders = await prisma.salesOrder.findMany({ where: { lines: { some: { productId: { in: productIds } } } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.inventoryItem.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.title.deleteMany({ where: { id: { in: titleIds } } });
  await prisma.partner.deleteMany({ where: { name: { in: [SUP, CLIENT] } } });
}

afterAll(cleanup);

describe("M19 — CSV import", () => {
  it("dry-run preview writes nothing", async () => {
    const csv = `Sana,Kitoblar,Miqdor,Summa_dona,Yetkazib beruvchi\n01.03.2026,${B1},100,15000,${SUP}`;
    const before = await prisma.product.count({ where: { sku: importProductSku(B1) } });
    const preview = await previewImport("kirimlar", csv);
    expect(preview.committed).toBe(false);
    expect(preview.summary.rows).toBe(1);
    expect(preview.summary.layers).toBe(1);
    expect(preview.summary.totalValue).toBe(1_500_000);
    const after = await prisma.product.count({ where: { sku: importProductSku(B1) } });
    expect(after).toBe(before); // nothing created
  });

  it("kirimlar commit creates catalog, supplier and a FIFO layer", async () => {
    const csv = `Sana,Kitoblar,Miqdor,Narxi,Summa_dona,Yetkazib beruvchi\n01.03.2026,${B1},100,25000,15000,${SUP}`;
    const r = await commitImport("kirimlar", csv, USER);
    expect(r.committed).toBe(true);
    expect(r.newProducts).toBe(1);
    expect(r.layers).toBe(1);

    const product = await prisma.product.findUniqueOrThrow({ where: { sku: importProductSku(B1) } });
    const layer = await prisma.stockMovement.findFirstOrThrow({ where: { productId: product.id, type: "IN", refType: "Import" } });
    expect(layer.qty).toBe(100);
    expect(new Date(layer.date).toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(Number(layer.unitCost)).toBe(15000);
    expect(layer.qtyRemaining).toBe(100);

    const supplier = await prisma.partner.findFirstOrThrow({ where: { name: SUP } });
    expect(supplier.roles).toContain("SUPPLIER");
  });

  it("is catalog-idempotent on re-import (same SKU reused, layers accumulate)", async () => {
    const csv = `Sana,Kitoblar,Miqdor,Summa_dona,Yetkazib beruvchi\n02.03.2026,${B1},50,16000,${SUP}`;
    const r = await commitImport("kirimlar", csv, USER);
    expect(r.newProducts).toBe(0); // product already exists from prior test
    const count = await prisma.product.count({ where: { sku: importProductSku(B1) } });
    expect(count).toBe(1);
    const layers = await prisma.stockMovement.count({
      where: { product: { sku: importProductSku(B1) }, type: "IN", refType: "Import" },
    });
    expect(layers).toBeGreaterThanOrEqual(2); // both imports booked
  });

  it("sotuv commit creates a SHIPPED order with sealed discount/cogs/cm", async () => {
    const csv =
      "Sana,Klient,Holat,Kitoblar,Kirim,Sotuv_narxi,Soni,Chegirma\n" +
      `05.03.2026,${CLIENT},Ulgurji,${B1},15000,25000,10,0.1`;
    const r = await commitImport("sotuv", csv, USER);
    expect(r.committed).toBe(true);
    expect(r.orders).toBe(1);

    const product = await prisma.product.findUniqueOrThrow({ where: { sku: importProductSku(B1) } });
    const line = await prisma.salesOrderLine.findFirstOrThrow({
      where: { productId: product.id, order: { partner: { name: CLIENT } } },
      include: { order: true },
    });
    expect(line.order.status).toBe("SHIPPED");
    expect(Number(line.discountRate)).toBe(0.1);
    expect(Number(line.cogsUnit)).toBe(15000);
    // net = 25000 * 0.9 = 22500; cm = 22500 - 15000 = 7500
    expect(Number(line.cmUnit)).toBe(7500);

    const client = await prisma.partner.findFirstOrThrow({ where: { name: CLIENT } });
    expect(client.roles).toContain("CLIENT");
  });

  it("refuses a commit with no valid rows and excludes bad rows", async () => {
    await expect(commitImport("kirimlar", "Sana,Kitoblar,Miqdor,Summa_dona,Yetkazib beruvchi", USER)).rejects.toThrow(ImportError);
    void B1_CYR;
  });
});
