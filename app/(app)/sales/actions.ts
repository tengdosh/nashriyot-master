"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, assertRowAccess } from "@/lib/rbac";
import {
  salesOrderCreateSchema,
  returnCreateSchema,
  paymentRegisterSchema,
  channelUpdateSchema,
} from "@/lib/validators/sales";
import {
  createSalesOrder,
  confirmSalesOrder,
  shipSalesOrder,
  invoiceSalesOrder,
  cancelSalesOrder,
} from "@/lib/services/sales-service";
import { createReturn } from "@/lib/services/returns-service";
import { registerPayment } from "@/lib/services/receivables-service";
import { previewDiscount } from "@/lib/services/discount-service";
import { prisma } from "@/lib/db";
import { runJob } from "@/jobs";

function revalidateSales(orderId?: string) {
  revalidatePath("/sales/orders");
  revalidatePath("/sales/receivables");
  revalidatePath("/sales/returns");
  if (orderId) revalidatePath(`/sales/orders/${orderId}`);
}

export async function createSalesOrderAction(input: unknown) {
  const parsed = salesOrderCreateSchema.parse(input);
  // Overriding the P_min floor is an admin act, not a sales act.
  const user = parsed.overridePMin
    ? await requirePermission("admin.settings")
    : await requirePermission("sales.write");
  assertRowAccess(user, { entityId: parsed.entityId });
  const { order } = await createSalesOrder(parsed, user.id);
  revalidateSales(order.id);
  return order.id;
}

export async function confirmOrderAction(id: string) {
  const user = await requirePermission("sales.write");
  const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, select: { entityId: true } });
  assertRowAccess(user, { entityId: row.entityId });
  await confirmSalesOrder(id, user.id);
  revalidateSales(id);
  revalidatePath("/inventory");
}

export async function shipOrderAction(id: string) {
  const user = await requirePermission("sales.write");
  const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, select: { entityId: true } });
  assertRowAccess(user, { entityId: row.entityId });
  await shipSalesOrder(id, user.id);
  revalidateSales(id);
  revalidatePath("/inventory");
}

export async function invoiceOrderAction(id: string) {
  const user = await requirePermission("sales.write");
  const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, select: { entityId: true } });
  assertRowAccess(user, { entityId: row.entityId });
  await invoiceSalesOrder(id, user.id);
  revalidateSales(id);
}

export async function cancelOrderAction(id: string) {
  const user = await requirePermission("sales.write");
  const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, select: { entityId: true } });
  assertRowAccess(user, { entityId: row.entityId });
  await cancelSalesOrder(id, user.id);
  revalidateSales(id);
  revalidatePath("/inventory");
}

export async function createReturnAction(input: unknown) {
  const user = await requirePermission("sales.write");
  const parsed = returnCreateSchema.parse(input);
  await createReturn(parsed, user.id);
  revalidateSales();
  revalidatePath("/inventory");
}

export async function registerPaymentAction(input: unknown) {
  const user = await requirePermission("finance.write");
  await registerPayment(paymentRegisterSchema.parse(input), user.id);
  revalidateSales();
}

/** Live discount preview for the order form — shows the rate AND its source. */
export async function previewDiscountAction(ctx: {
  partnerId?: string | null;
  titleId?: string | null;
  entityId?: string | null;
  qty: number;
  unitPrice: number;
}) {
  await requirePermission("sales.read");
  const r = await previewDiscount(ctx);
  return {
    rate: r.rate.toNumber(),
    source: r.source,
    ruleId: r.ruleId,
    effectivePrice: r.effectivePrice.toNumber(),
  };
}

/**
 * Channel settings apply to NEW orders only — sealed lines on existing documents
 * are never touched (spec v1 §5.5).
 */
export async function updateChannelAction(input: unknown) {
  const user = await requirePermission("sales.write");
  const p = channelUpdateSchema.parse(input);
  const { runWithAudit } = await import("@/lib/audit-context");
  await runWithAudit({ userId: user.id }, async () => {
    await prisma.salesChannel.update({
      where: { id: p.id },
      data: {
        defaultDiscount: p.defaultDiscount,
        feeRate: p.feeRate,
        paymentTermDays: p.paymentTermDays,
      },
    });
  });
  revalidatePath("/sales/channels");
}

export async function runArOverdueAction() {
  const user = await requirePermission("admin.settings");
  const res = await runJob("ar-overdue", user.id);
  revalidatePath("/sales/receivables");
  return res.result;
}
