import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Stock IN — opens a FIFO layer (StockMovement type=IN with unitCost +
 * qtyRemaining) and bumps InventoryItem.qtyOnHand. MUST be called inside a
 * transaction. `unitCostUZS` is the print unit cost in soʻm ONLY — the unique
 * (title) share is NEVER added here; it lives in daily_unit_cost (M12). This is
 * the no-double-counting guarantee.
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
      date: input.date ?? new Date(),
    },
  });

  await tx.inventoryItem.upsert({
    where: {
      productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId },
    },
    create: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      qtyOnHand: input.qty,
      qtyReserved: 0,
    },
    update: { qtyOnHand: { increment: input.qty } },
  });

  return movement;
}

/** Current on-hand quantity across all warehouses for a product. */
export async function quantityOnHand(productId: string): Promise<number> {
  const agg = await prisma.inventoryItem.aggregate({
    where: { productId },
    _sum: { qtyOnHand: true },
  });
  return agg._sum.qtyOnHand ?? 0;
}
