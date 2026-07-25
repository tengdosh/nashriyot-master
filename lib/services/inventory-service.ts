import { Prisma, type StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

/** Rejected inventory operation (bad warehouse type, missing reason, …). */
export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * Movement types that carry a consumable FIFO layer (`unitCost` + `qtyRemaining`).
 * A sellable RETURN re-enters stock as its own layer rather than as a second row,
 * so the returned copies stay countable in the four-state view AND consumable.
 */
export const LAYER_TYPES: StockMovementType[] = ["IN", "RETURN"];

/**
 * Stock IN — opens a FIFO layer (StockMovement type=IN, unitCost + qtyRemaining)
 * and bumps InventoryItem.qtyOnHand. Run inside a transaction. `unitCostUZS` is
 * the print unit in soʻm ONLY — the unique/title share is NEVER added here (M12).
 */
export async function stockIn(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    qty: number;
    unitCostUZS: Prisma.Decimal.Value;
    refType?: string;
    refId?: string;
    reason?: string;
    date?: Date;
  },
) {
  const movement = await tx.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: "IN",
      qty: input.qty,
      unitCost: new Prisma.Decimal(input.unitCostUZS),
      qtyRemaining: input.qty,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      reason: input.reason ?? null,
      date: input.date ?? new Date(),
    },
  });
  await tx.inventoryItem.upsert({
    where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
    create: { productId: input.productId, warehouseId: input.warehouseId, qtyOnHand: input.qty, qtyReserved: 0 },
    update: { qtyOnHand: { increment: input.qty } },
  });
  return movement;
}

export async function stockInTx(
  input: { productId: string; warehouseId: string; qty: number; unitCostUZS: Prisma.Decimal.Value; refType?: string; refId?: string },
  userId: string,
) {
  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => stockIn(tx as unknown as Prisma.TransactionClient, input)),
  );
}

/**
 * FIFO issue — consume oldest IN layers, create an OUT movement at the weighted
 * COGS, decrement qtyOnHand. Returns { cogs, cogsUnit }. Run inside a transaction.
 */
export async function fifoIssue(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    qty: number;
    type?: StockMovementType;
    refType?: string;
    refId?: string;
    reason?: string;
  },
): Promise<{ cogs: Prisma.Decimal; cogsUnit: Prisma.Decimal }> {
  const layers = await tx.stockMovement.findMany({
    where: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: { in: LAYER_TYPES },
      qtyRemaining: { gt: 0 },
    },
    orderBy: { date: "asc" },
  });
  let remaining = input.qty;
  let cogs = new Prisma.Decimal(0);
  for (const l of layers) {
    if (remaining <= 0) break;
    const avail = l.qtyRemaining ?? 0;
    const take = Math.min(remaining, avail);
    if (take <= 0) continue;
    cogs = cogs.plus(new Prisma.Decimal(l.unitCost ?? 0).times(take));
    await tx.stockMovement.update({ where: { id: l.id }, data: { qtyRemaining: avail - take } });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new InsufficientStockError(`Yetarli qoldiq yoʻq (${input.qty - remaining}/${input.qty})`);
  }
  const cogsUnit = cogs.div(input.qty);
  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type ?? "OUT",
      qty: input.qty,
      unitCost: cogsUnit,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      reason: input.reason ?? null,
      date: new Date(),
    },
  });
  await tx.inventoryItem.update({
    where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
    data: { qtyOnHand: { decrement: input.qty } },
  });
  return { cogs, cogsUnit };
}

export async function fifoIssueTx(
  input: { productId: string; warehouseId: string; qty: number; type?: StockMovementType; refType?: string; refId?: string },
  userId: string,
) {
  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => fifoIssue(tx as unknown as Prisma.TransactionClient, input)),
  );
}

/** Weighted-average unit cost of the remaining FIFO layers. */
export async function fifoAvgUnitCost(productId: string, warehouseId?: string): Promise<Prisma.Decimal> {
  const layers = await prisma.stockMovement.findMany({
    where: {
      productId,
      type: { in: LAYER_TYPES },
      qtyRemaining: { gt: 0 },
      ...(warehouseId ? { warehouseId } : {}),
    },
  });
  let qty = 0;
  let cost = new Prisma.Decimal(0);
  for (const l of layers) {
    const q = l.qtyRemaining ?? 0;
    qty += q;
    cost = cost.plus(new Prisma.Decimal(l.unitCost ?? 0).times(q));
  }
  return qty > 0 ? cost.div(qty) : new Prisma.Decimal(0);
}

/**
 * Transfer between warehouses (agent give / return). FIFO-consume the source and
 * recreate matching IN layers at the SAME cost at the destination (cost carries).
 * A TRANSFER is NOT a sale, so it never touches the "Sotilgan" figure.
 */
export async function transferStock(
  input: { productId: string; fromWarehouseId: string; toWarehouseId: string; qty: number; reason?: string },
  userId: string,
) {
  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      const layers = await tx.stockMovement.findMany({
        where: {
          productId: input.productId,
          warehouseId: input.fromWarehouseId,
          type: { in: LAYER_TYPES },
          qtyRemaining: { gt: 0 },
        },
        orderBy: { date: "asc" },
      });
      let remaining = input.qty;
      const chunks: { cost: Prisma.Decimal; qty: number }[] = [];
      for (const l of layers) {
        if (remaining <= 0) break;
        const avail = l.qtyRemaining ?? 0;
        const take = Math.min(remaining, avail);
        if (take <= 0) continue;
        chunks.push({ cost: new Prisma.Decimal(l.unitCost ?? 0), qty: take });
        await tx.stockMovement.update({ where: { id: l.id }, data: { qtyRemaining: avail - take } });
        remaining -= take;
      }
      if (remaining > 0) throw new InsufficientStockError("Transfer uchun yetarli qoldiq yoʻq");

      await tx.stockMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.fromWarehouseId,
          type: "TRANSFER",
          qty: input.qty,
          refType: "Transfer",
          reason: input.reason ?? null,
          date: new Date(),
        },
      });
      await tx.inventoryItem.update({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.fromWarehouseId } },
        data: { qtyOnHand: { decrement: input.qty } },
      });
      for (const c of chunks) {
        await tx.stockMovement.create({
          data: {
            productId: input.productId,
            warehouseId: input.toWarehouseId,
            type: "IN",
            qty: c.qty,
            unitCost: c.cost,
            qtyRemaining: c.qty,
            refType: "Transfer",
            reason: input.reason ?? null,
            date: new Date(),
          },
        });
      }
      await tx.inventoryItem.upsert({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.toWarehouseId } },
        create: { productId: input.productId, warehouseId: input.toWarehouseId, qtyOnHand: input.qty, qtyReserved: 0 },
        update: { qtyOnHand: { increment: input.qty } },
      });
      return { qty: input.qty };
    }),
  );
}

/** Agent consignment: hand stock to an AGENT warehouse. Cost travels with it. */
export async function giveToAgent(
  input: { productId: string; fromWarehouseId: string; agentWarehouseId: string; qty: number; reason?: string },
  userId: string,
) {
  const wh = await prisma.warehouse.findUniqueOrThrow({ where: { id: input.agentWarehouseId } });
  if (wh.type !== "AGENT") {
    throw new InventoryError("Konsignatsiya faqat AGENT turidagi omborga beriladi");
  }
  return transferStock(
    {
      productId: input.productId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.agentWarehouseId,
      qty: input.qty,
      reason: input.reason ?? "Agentga konsignatsiya",
    },
    userId,
  );
}

/** Agent brings unsold consignment copies back — still not a sale. */
export async function takeBackFromAgent(
  input: { productId: string; agentWarehouseId: string; toWarehouseId: string; qty: number; reason?: string },
  userId: string,
) {
  return transferStock(
    {
      productId: input.productId,
      fromWarehouseId: input.agentWarehouseId,
      toWarehouseId: input.toWarehouseId,
      qty: input.qty,
      reason: input.reason ?? "Agentdan qaytarish",
    },
    userId,
  );
}

/**
 * Stocktake correction. A positive delta opens a layer at the current weighted
 * average (an ADJUST must never invent a new cost basis); a negative delta
 * consumes FIFO. `reason` is mandatory — an unexplained ADJUST is a hole in the
 * audit trail.
 */
export async function adjustStock(
  input: { productId: string; warehouseId: string; delta: number; reason: string },
  userId: string,
) {
  if (input.delta === 0) throw new InventoryError("Tuzatish miqdori 0 boʻlishi mumkin emas");
  if (!input.reason.trim()) throw new InventoryError("Tuzatish uchun sabab majburiy");

  const avgCost = await fifoAvgUnitCost(input.productId, input.warehouseId);

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      if (input.delta > 0) {
        return stockIn(tx, {
          productId: input.productId,
          warehouseId: input.warehouseId,
          qty: input.delta,
          unitCostUZS: avgCost,
          refType: "Adjust",
          reason: input.reason,
        });
      }
      return fifoIssue(tx, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: -input.delta,
        type: "ADJUST",
        refType: "Adjust",
        reason: input.reason,
      });
    }),
  );
}

/**
 * Customer return. SELLABLE copies re-enter stock as a consumable RETURN layer
 * at the weighted average cost; DAMAGED copies are recorded (so the four-state
 * "Qaytgan" figure is honest) but never go back on hand.
 */
export async function returnStock(
  input: {
    productId: string;
    warehouseId: string;
    qty: number;
    condition: "SELLABLE" | "DAMAGED";
    refType?: string;
    refId?: string;
    reason?: string;
  },
  userId: string,
) {
  if (input.qty <= 0) throw new InventoryError("Qaytarish miqdori 0 dan katta boʻlishi kerak");
  const avgCost = await fifoAvgUnitCost(input.productId, input.warehouseId);
  const sellable = input.condition === "SELLABLE";

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      const movement = await tx.stockMovement.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: "RETURN",
          qty: input.qty,
          unitCost: avgCost,
          // Only a sellable return is a consumable FIFO layer.
          qtyRemaining: sellable ? input.qty : 0,
          refType: input.refType ?? "Return",
          refId: input.refId ?? null,
          reason: input.reason ?? (sellable ? "Sotuvga yaroqli qaytish" : "Nuqsonli qaytish"),
          date: new Date(),
        },
      });
      if (sellable) {
        await tx.inventoryItem.upsert({
          where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
          create: { productId: input.productId, warehouseId: input.warehouseId, qtyOnHand: input.qty, qtyReserved: 0 },
          update: { qtyOnHand: { increment: input.qty } },
        });
      }
      return movement;
    }),
  );
}

/** Four states: Omborda / Agentda / Sotilgan / Qaytgan (spec v2 §3). */
export async function fourState(productId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { productId },
    include: { warehouse: { select: { type: true } } },
  });
  let omborda = 0;
  let agentda = 0;
  for (const i of items) {
    if (i.warehouse.type === "AGENT") agentda += i.qtyOnHand;
    else omborda += i.qtyOnHand;
  }
  const [sold, ret] = await Promise.all([
    prisma.stockMovement.aggregate({ where: { productId, type: "OUT" }, _sum: { qty: true } }),
    prisma.stockMovement.aggregate({ where: { productId, type: "RETURN" }, _sum: { qty: true } }),
  ]);
  return { omborda, agentda, sotilgan: sold._sum.qty ?? 0, qaytgan: ret._sum.qty ?? 0 };
}

export async function quantityOnHand(productId: string): Promise<number> {
  const agg = await prisma.inventoryItem.aggregate({ where: { productId }, _sum: { qtyOnHand: true } });
  return agg._sum.qtyOnHand ?? 0;
}

/** Days since the last sale (OUT); falls back to the oldest IN if never sold. */
export async function lastSaleAgeDays(productId: string, now: Date = new Date()): Promise<number> {
  const lastOut = await prisma.stockMovement.findFirst({
    where: { productId, type: "OUT" },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  let ref = lastOut?.date ?? null;
  if (!ref) {
    const firstIn = await prisma.stockMovement.findFirst({
      where: { productId, type: { in: LAYER_TYPES } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    ref = firstIn?.date ?? null;
  }
  if (!ref) return 0;
  return Math.floor((now.getTime() - ref.getTime()) / 86_400_000);
}

/** Copies already ordered from a printer but not yet received (On Order column). */
export async function onOrderQty(productId: string): Promise<number> {
  const agg = await prisma.printOrder.aggregate({
    where: { productId, status: { in: ["REQUESTED", "APPROVED", "PRINTING"] } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

/**
 * Units sold (OUT) in a trailing window, dated — the raw series both the ROP
 * monitor and the turnover/seasonality checks build on.
 */
export async function salesSeries(
  productId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<{ date: Date; qty: number }[]> {
  const from = new Date(now.getTime() - windowDays * 86_400_000);
  const rows = await prisma.stockMovement.findMany({
    where: { productId, type: "OUT", date: { gte: from } },
    select: { date: true, qty: true },
    orderBy: { date: "asc" },
  });
  return rows;
}
