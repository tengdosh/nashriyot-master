import { Prisma, type AbcClass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import {
  abcClassify,
  availableQty,
  dailySeries,
  demandStats,
  ropCheck,
  serviceLevelZFor,
  stockStatus,
  type RopResult,
  type StockStatus,
} from "@/lib/inventory-analytics";
import { getInventorySettings, type InventorySettings } from "./inventory-settings";
import { fifoAvgUnitCost, onOrderQty, salesSeries } from "./inventory-service";
import { netSalesByProduct } from "./returns-service";

/**
 * ROP monitor and ABC classifier (spec v1 §6.3, nightly 03:00).
 *
 * Service level comes from the SKU's ABC class when it has one (A 99% / B 95% /
 * C 90%) and falls back to the global setting otherwise — so the ABC job feeding
 * the ROP job is the intended order, and an unclassified SKU still gets a point.
 */

export type SkuRop = {
  productId: string;
  available: number;
  onOrder: number;
  unitCost: Prisma.Decimal;
  abcClass: AbcClass | null;
  rop: RopResult;
  status: StockStatus;
};

async function ropForProduct(
  product: { id: string; abcClass: AbcClass | null },
  cfg: InventorySettings,
  now: Date,
): Promise<SkuRop> {
  const [items, sales, unitCost, onOrder, rule, deadFlag] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { productId: product.id } }),
    salesSeries(product.id, cfg.dailyDemandWindowDays, now),
    fifoAvgUnitCost(product.id),
    onOrderQty(product.id),
    prisma.reorderRule.findUnique({ where: { productId: product.id } }),
    prisma.deadStockFlag.findUnique({ where: { productId: product.id }, select: { status: true } }),
  ]);

  const available = items.reduce((a, i) => a + availableQty(i.qtyOnHand, i.qtyReserved), 0);
  const stats = demandStats(
    dailySeries(sales, cfg.dailyDemandWindowDays, now),
    cfg.dailyDemandWindowDays,
  );

  const rop = ropCheck({
    stats,
    leadTimeDays: rule?.leadTimeDays ?? 30,
    serviceLevelZ: product.abcClass
      ? serviceLevelZFor(product.abcClass)
      : (rule?.serviceLevelZ ?? cfg.serviceLevelZ),
    available,
    unitCost,
    carryingRate: cfg.carryingRate,
    orderCost: cfg.orderCost,
    manualROP: rule?.isAuto === false ? rule.manualROP : null,
  });

  return {
    productId: product.id,
    available,
    onOrder,
    unitCost,
    abcClass: product.abcClass,
    rop,
    status: stockStatus({
      available,
      rop: rop.rop,
      isDead: !!deadFlag && deadFlag.status !== "WRITTEN_OFF",
    }),
  };
}

export type RopMonitorResult = { scanned: number; alerts: number; skipped: number };

/**
 * Raise a ROP alert (with an EOQ suggestion) for every SKU that has dropped
 * below its reorder point. SKUs already covered by an open print order are
 * skipped — we do not nag about a reprint that is already on its way.
 */
export async function runRopMonitor(
  opts: { userId: string; now?: Date; settings?: InventorySettings } = { userId: "system" },
): Promise<RopMonitorResult> {
  const now = opts.now ?? new Date();
  const cfg = opts.settings ?? (await getInventorySettings());
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: { id: true, sku: true, abcClass: true, title: { select: { workTitle: true } } },
  });

  const out: RopMonitorResult = { scanned: products.length, alerts: 0, skipped: 0 };

  return runWithAudit({ userId: opts.userId }, async () => {
    for (const p of products) {
      const r = await ropForProduct(p, cfg, now);
      if (!r.rop.needsReorder) continue;
      if (r.onOrder > 0) {
        out.skipped += 1;
        continue;
      }
      await prisma.notification.create({
        data: {
          type: "ROP",
          severity: r.available <= 0 ? "CRITICAL" : "WARNING",
          title: "Qayta buyurtma nuqtasi",
          body: `${p.title.workTitle}${p.sku ? ` (${p.sku})` : ""}: mavjud ${r.available}, ROP ${r.rop.rop.toFixed(0)} — tavsiya ${r.rop.suggestQty} dona (EOQ)`,
          linkUrl: "/production/print-orders",
          refType: "Product",
          refId: p.id,
          targetRole: "PRODUCTION_MANAGER",
        },
      });
      out.alerts += 1;
    }
    return out;
  });
}

export type AbcRowView = {
  productId: string;
  sku: string | null;
  workTitle: string;
  revenue: Prisma.Decimal;
  share: Prisma.Decimal;
  cumulative: Prisma.Decimal;
  abcClass: AbcClass;
};

/**
 * Annual revenue per SKU for the ABC curve — SEALED net revenue from shipped
 * sales-order lines (M6), net of returns.
 *
 * A SKU with no sales lines in the window falls back to OUT movements × list
 * price. That covers stock issued outside the sales module (opening balances,
 * migrated history) instead of ranking those SKUs at zero.
 */
export async function annualRevenue(now: Date) {
  const from = new Date(now.getTime() - 365 * 86_400_000);
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: { id: true, sku: true, listPrice: true, title: { select: { workTitle: true } } },
  });

  const sealed = await netSalesByProduct(from, now);
  const sealedById = new Map(sealed.map((s) => [s.product.id, s]));

  // Units that left the warehouse WITHOUT a sales order behind them. The
  // explicit null branch matters: in SQL `refType != 'SalesOrder'` is NULL for
  // NULL rows, which would silently drop every un-referenced movement.
  const movementOnly = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      type: "OUT",
      date: { gte: from },
      OR: [{ refType: null }, { refType: { notIn: ["SalesOrder", "TransferOrder"] } }],
    },
    _sum: { qty: true },
  });
  const looseQtyById = new Map(movementOnly.map((s) => [s.productId, s._sum.qty ?? 0]));

  return products.map((p) => {
    const s = sealedById.get(p.id);
    const looseQty = looseQtyById.get(p.id) ?? 0;
    const looseRevenue = new Prisma.Decimal(p.listPrice).times(looseQty);
    return {
      item: { productId: p.id, sku: p.sku, workTitle: p.title.workTitle },
      revenue: (s?.revenue ?? new Prisma.Decimal(0)).plus(looseRevenue),
    };
  });
}

/** Recompute and persist Product.abcClass from the cumulative 80/15/5 curve. */
export async function recalcAbc(
  opts: { userId: string; now?: Date } = { userId: "system" },
): Promise<{ rows: AbcRowView[]; counts: Record<AbcClass, number> }> {
  const now = opts.now ?? new Date();
  const classified = abcClassify(await annualRevenue(now));
  const counts: Record<AbcClass, number> = { A: 0, B: 0, C: 0 };
  const rows: AbcRowView[] = [];

  await runWithAudit({ userId: opts.userId }, async () => {
    for (const r of classified) {
      const abcClass = r.abcClass as AbcClass;
      counts[abcClass] += 1;
      rows.push({
        productId: r.item.productId,
        sku: r.item.sku,
        workTitle: r.item.workTitle,
        revenue: new Prisma.Decimal(r.revenue),
        share: new Prisma.Decimal(r.share),
        cumulative: new Prisma.Decimal(r.cumulative),
        abcClass,
      });
      await prisma.product.update({ where: { id: r.item.productId }, data: { abcClass } });
    }
  });

  return { rows, counts };
}

/** Per-SKU rows for the /inventory table (QoH / Reserved / Available / On Order / status). */
export async function inventoryOverview(now: Date = new Date()) {
  const cfg = await getInventorySettings();
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      sku: true,
      isbn13: true,
      format: true,
      listPrice: true,
      abcClass: true,
      title: { select: { workTitle: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    products.map(async (p) => {
      const [r, items] = await Promise.all([
        ropForProduct(p, cfg, now),
        prisma.inventoryItem.findMany({
          where: { productId: p.id },
          include: { warehouse: { select: { id: true, name: true, type: true } } },
        }),
      ]);
      return {
        product: p,
        qtyOnHand: items.reduce((a, i) => a + i.qtyOnHand, 0),
        qtyReserved: items.reduce((a, i) => a + i.qtyReserved, 0),
        byWarehouse: items,
        ...r,
      };
    }),
  );
}
