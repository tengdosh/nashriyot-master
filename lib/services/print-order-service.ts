import { Prisma, type PrintOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { stockIn } from "./inventory-service";
import { createCostEntry } from "./cost-service";
import type { PrintOrderCreateInput } from "@/lib/validators/production";

// Status machine (spec §5.3): REQUESTED→APPROVED→PRINTING→RECEIVED.
export const PRINT_FLOW: Record<PrintOrderStatus, PrintOrderStatus[]> = {
  REQUESTED: ["APPROVED"],
  APPROVED: ["PRINTING"],
  PRINTING: ["RECEIVED"],
  RECEIVED: [],
};

export class PrintOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintOrderError";
  }
}

export function canPrintTransition(from: PrintOrderStatus, to: PrintOrderStatus): boolean {
  return PRINT_FLOW[from]?.includes(to) ?? false;
}

export async function createPrintOrder(input: PrintOrderCreateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.printOrder.create({
      data: {
        editionId: input.editionId,
        productId: input.productId,
        printerId: input.printerId,
        quantity: input.quantity,
        unitPPB: new Prisma.Decimal(input.unitPPB),
        fixedCost: new Prisma.Decimal(input.fixedCost),
        currency: input.currency,
        rate: new Prisma.Decimal(input.rate), // SEALED at creation
        status: "REQUESTED",
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
      },
    });
  });
}

export async function transitionPrintOrder(orderId: string, to: PrintOrderStatus, userId: string) {
  const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!canPrintTransition(order.status, to)) {
    throw new PrintOrderError(`Holat oʻtishi taqiqlangan: ${order.status} → ${to}`);
  }
  return runWithAudit({ userId }, async () => {
    return await prisma.printOrder.update({ where: { id: orderId }, data: { status: to } });
  });
}

/**
 * QABUL: receive a print run → stock IN in a transaction. The FIFO layer's
 * unitCost is the ACTUAL print unit in soʻm (unitPPB × rate) — print ONLY.
 * Then a plan-vs-fact check: if the actual print unit deviates >10% from the
 * edition scenario's planned PC, raise a VARIANCE notification.
 */
export async function receivePrintOrder(
  orderId: string,
  actualQty: number,
  warehouseId: string,
  userId: string,
) {
  return runWithAudit({ userId }, async () => {
    const order = await prisma.printOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "PRINTING") {
      throw new PrintOrderError("QABUL faqat BOSILMOQDA holatidan mumkin");
    }

    // Actual print unit cost in soʻm — ONLY print (no unique/title share here).
    const unitCostUZS = new Prisma.Decimal(order.unitPPB).times(order.rate);

    const updated = await prisma.$transaction(async (tx) => {
      await stockIn(tx as unknown as Prisma.TransactionClient, {
        productId: order.productId,
        warehouseId,
        qty: actualQty,
        unitCostUZS,
        refType: "PrintOrder",
        refId: order.id,
      });
      return tx.printOrder.update({
        where: { id: orderId },
        data: { status: "RECEIVED", receivedQty: actualQty, receivedDate: new Date() },
      });
    });

    // Fixed cost entry (pre-press, setup fees) — separate from FIFO unitCost to avoid double-counting.
    const fixedDec = new Prisma.Decimal(order.fixedCost ?? 0);
    if (order.editionId && fixedDec.gt(0)) {
      await createCostEntry(
        {
          scope: "EDITION",
          category: "BOSMA",
          editionId: order.editionId,
          amount: fixedDec.toNumber(),
          currency: order.currency,
          rate: Number(order.rate),
          date: new Date().toISOString().split("T")[0],
        },
        userId,
      );
    }

    await checkVariance(order.editionId, order.id, unitCostUZS.toNumber());
    return { order: updated, unitCostUZS };
  });
}

async function checkVariance(
  editionId: string | null,
  printOrderId: string,
  actualUnit: number,
): Promise<boolean> {
  if (!editionId) return false;
  const scenario = await prisma.plScenario.findFirst({
    where: { editionId },
    orderBy: { updatedAt: "desc" },
  });
  const planned = (scenario?.results as { pc?: number } | null)?.pc;
  if (!planned || planned <= 0) return false;
  const diff = Math.abs(actualUnit - planned) / planned;
  if (diff <= 0.1) return false;

  await prisma.notification.create({
    data: {
      type: "VARIANCE",
      severity: "WARNING",
      title: "Reja vs Fakt farqi >10%",
      body: `Bosma birlik: reja ${Math.round(planned)}, fakt ${Math.round(actualUnit)} soʻm (${Math.round(diff * 100)}%)`,
      linkUrl: "/production/print-orders",
      refType: "PrintOrder",
      refId: printOrderId,
      targetRole: "PRODUCTION_MANAGER",
    },
  });
  return true;
}
