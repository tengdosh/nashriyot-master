/**
 * Load the real business data from the provided files (spec v2 §9).
 * Converts kirimlar.xlsx / Sotuv 2025-2026.xlsx → CSV (done offline, in
 * import-csv/) and feeds them through the tested M19 import engine
 * (commitImport). Wipes the demo namespace and any prior real import first, so
 * the P&L reconciles cleanly against Foyda_Zarar_2026.html.
 *
 * Run: DATABASE_URL=… npx tsx prisma/seed-real.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { commitImport } from "@/lib/services/import-service";

const USER = "user-director";

async function wipeDemo() {
  const P = { startsWith: "demo-" };
  const PP = { startsWith: "demo-p" };
  await prisma.audioChapter.deleteMany({ where: { job: { title: { id: { startsWith: "demo-t" } } } } });
  await prisma.audioJob.deleteMany({ where: { title: { id: { startsWith: "demo-t" } } } });
  await prisma.geoAnnotation.deleteMany({ where: { titleId: { startsWith: "demo-t" } } });
  await prisma.payment.deleteMany({ where: { id: P } });
  await prisma.receivable.deleteMany({ where: { id: P } });
  await prisma.payable.deleteMany({ where: { id: P } });
  await prisma.salesOrderLine.deleteMany({ where: { orderId: P } });
  await prisma.salesOrder.deleteMany({ where: { id: P } });
  await prisma.deadStockFlag.deleteMany({ where: { productId: PP } });
  await prisma.stockMovement.deleteMany({ where: { productId: PP } });
  await prisma.inventoryItem.deleteMany({ where: { productId: PP } });
  await prisma.dailyUnitCost.deleteMany({ where: { productId: PP } });
  await prisma.royaltyStatement.deleteMany({ where: { id: P } });
  await prisma.royaltyRun.deleteMany({ where: { id: P } });
  await prisma.royaltyTier.deleteMany({ where: { id: P } });
  await prisma.contract.deleteMany({ where: { id: P } });
  await prisma.costEntry.deleteMany({ where: { id: P } });
  await prisma.lead.deleteMany({ where: { id: P } });
  await prisma.notification.deleteMany({ where: { refId: { startsWith: "demo-" } } });
  await prisma.product.deleteMany({ where: { id: PP } });
  await prisma.edition.deleteMany({ where: { id: { startsWith: "demo-e" } } });
  await prisma.title.deleteMany({ where: { id: { startsWith: "demo-t" } } });
}

/** Remove a previous real import (products keyed IMP-*) so re-running is clean. */
async function wipeReal() {
  const impProducts = await prisma.product.findMany({ where: { sku: { startsWith: "IMP-" } }, select: { id: true, titleId: true } });
  const pids = impProducts.map((p) => p.id);
  if (pids.length === 0) return;
  const titleIds = [...new Set(impProducts.map((p) => p.titleId))];
  const orders = await prisma.salesOrder.findMany({ where: { lines: { some: { productId: { in: pids } } } }, select: { id: true } });
  const oids = orders.map((o) => o.id);
  await prisma.receivable.deleteMany({ where: { orderId: { in: oids } } });
  await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: oids } } });
  await prisma.salesOrder.deleteMany({ where: { id: { in: oids } } });
  await prisma.deadStockFlag.deleteMany({ where: { productId: { in: pids } } });
  await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
  await prisma.inventoryItem.deleteMany({ where: { productId: { in: pids } } });
  await prisma.dailyUnitCost.deleteMany({ where: { productId: { in: pids } } });
  await prisma.geoAnnotation.deleteMany({ where: { titleId: { in: titleIds } } });
  await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.title.deleteMany({ where: { id: { in: titleIds } } });
}

async function pnl() {
  const rows = await prisma.$queryRawUnsafe<{ net: string; cm: string; units: string; orders: string }[]>(
    `SELECT COALESCE(SUM(l."unitPrice" * (1 - l."discountRate") * l.qty),0)::text net,
            COALESCE(SUM(l."cmUnit" * l.qty),0)::text cm,
            COALESCE(SUM(l.qty),0)::text units,
            COUNT(DISTINCT o.id)::text orders
       FROM "SalesOrderLine" l JOIN "SalesOrder" o ON o.id=l."orderId"
       JOIN "Product" p ON p.id=l."productId"
      WHERE p.sku LIKE 'IMP-%' AND o.status IN ('SHIPPED','INVOICED','PAID')`,
  );
  return rows[0];
}

async function main() {
  console.log("Real import: wiping demo + prior real import…");
  await wipeDemo();
  await wipeReal();

  const base = join(process.cwd(), "import-csv");
  console.log("Importing kirimlar…");
  const k = await commitImport("kirimlar", readFileSync(join(base, "kirimlar.csv"), "utf8"), USER);
  console.log("  ", JSON.stringify({ layers: k.layers, newTitles: k.newTitles, newProducts: k.newProducts, newPartners: k.newPartners }));
  console.log("Importing sotuv…");
  const s = await commitImport("sotuv", readFileSync(join(base, "sotuv.csv"), "utf8"), USER);
  console.log("  ", JSON.stringify({ orders: s.orders, newTitles: s.newTitles, newProducts: s.newProducts, newPartners: s.newPartners }));

  for (const v of ["mv_monthly_sales", "mv_title_kpi", "mv_ar_aging"]) {
    try { await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${v}`); }
    catch { try { await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${v}`); } catch { /* noop */ } }
  }

  const p = await pnl();
  const f = (n: string) => Number(n).toLocaleString("ru-RU");
  console.log("\n=== Real-data P&L (imported sales) ===");
  console.log(`  Orders: ${f(p.orders)}  Units: ${f(p.units)}`);
  console.log(`  Net revenue: ${f(p.net)} so'm`);
  console.log(`  Gross margin (CM): ${f(p.cm)} so'm`);
  console.log(`  Golden (Foyda_Zarar_2026.html): daromad 2 642 991 000 · yalpi foyda 1 331 464 500`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
