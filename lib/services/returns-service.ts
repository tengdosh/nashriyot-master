import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { netSales } from "@/lib/sales";
import { returnStock } from "./inventory-service";
import type { ReturnCreateInput } from "@/lib/validators/sales";

export class ReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnError";
  }
}

/**
 * Register a customer return against a shipped line (spec v1 §5.5).
 *
 * SELLABLE copies re-enter stock as their own FIFO layer (M5); DAMAGED copies are
 * recorded but never go back on hand. Either way the return reduces the period's
 * NET sales — that is what royalty runs and channel KPIs read.
 *
 * Returns are capped at what actually shipped on that line, so a line can never
 * be over-returned into fictional revenue.
 */
export async function createReturn(input: ReturnCreateInput, userId: string) {
  const line = await prisma.salesOrderLine.findUniqueOrThrow({
    where: { id: input.orderLineId },
    include: { order: { select: { id: true, status: true, warehouseId: true } }, returns: true },
  });

  if (!["SHIPPED", "INVOICED", "PAID"].includes(line.order.status)) {
    throw new ReturnError(`Qaytish faqat joʻnatilgan buyurtmada (holat: ${line.order.status})`);
  }

  const already = line.returns.reduce((a, r) => a + r.qty, 0);
  if (already + input.qty > line.qty) {
    throw new ReturnError(
      `Qaytish miqdori joʻnatilgandan oshib ketdi: joʻnatilgan ${line.qty}, allaqachon qaytgan ${already}`,
    );
  }

  return runWithAudit({ userId }, async () => {
    const ret = await prisma.return.create({
      data: { orderLineId: line.id, qty: input.qty, condition: input.condition, date: new Date() },
    });
    // The stock side goes through the M5 service so the four-state view and the
    // FIFO layers stay the single source of truth.
    await returnStock(
      {
        productId: line.productId,
        warehouseId: line.order.warehouseId,
        qty: input.qty,
        condition: input.condition,
        refType: "Return",
        refId: ret.id,
      },
      userId,
    );
    return ret;
  });
}

/**
 * Period net sales per SKU from SEALED line data — units shipped minus units
 * returned, valued at the sealed net unit. This is the measure that replaces the
 * M5 interim movement-based proxy.
 */
export async function netSalesByProduct(from: Date, to: Date) {
  const lines = await prisma.salesOrderLine.findMany({
    where: {
      order: { status: { in: ["SHIPPED", "INVOICED", "PAID"] }, shippedDate: { gte: from, lte: to } },
    },
    include: {
      order: { select: { channel: { select: { feeRate: true } } } },
      returns: { where: { date: { lte: to } } },
      product: { select: { id: true, sku: true, title: { select: { workTitle: true } } } },
    },
  });

  const byProduct = new Map<
    string,
    {
      product: { id: string; sku: string | null; workTitle: string };
      lines: { qty: number; returnedQty: number; netUnit: Prisma.Decimal }[];
      cm: Prisma.Decimal;
    }
  >();

  for (const l of lines) {
    const feeRate = new Prisma.Decimal(l.order.channel.feeRate);
    const netUnit = new Prisma.Decimal(l.unitPrice)
      .times(new Prisma.Decimal(1).minus(l.discountRate))
      .times(new Prisma.Decimal(1).minus(feeRate));
    const returnedQty = l.returns.reduce((a, r) => a + r.qty, 0);

    const entry =
      byProduct.get(l.productId) ??
      {
        product: { id: l.product.id, sku: l.product.sku, workTitle: l.product.title.workTitle },
        lines: [],
        cm: new Prisma.Decimal(0),
      };
    entry.lines.push({ qty: l.qty, returnedQty, netUnit });
    // CM is only counted for the copies the customer kept.
    entry.cm = entry.cm.plus(new Prisma.Decimal(l.cmUnit ?? 0).times(l.qty - returnedQty));
    byProduct.set(l.productId, entry);
  }

  return [...byProduct.values()].map((e) => {
    const ns = netSales(e.lines);
    return {
      product: e.product,
      units: ns.units,
      returnedUnits: ns.returnedUnits,
      netUnits: ns.netUnits,
      revenue: new Prisma.Decimal(ns.revenue.toFixed(2)),
      cm: e.cm,
    };
  });
}

/** Returns journal for /sales/returns. */
export async function listReturns(take = 200) {
  return prisma.return.findMany({
    take,
    orderBy: { date: "desc" },
    include: {
      orderLine: {
        include: {
          order: { select: { id: true, status: true, customerName: true, partner: { select: { name: true } } } },
          product: { select: { sku: true, title: { select: { workTitle: true } } } },
        },
      },
    },
  });
}
