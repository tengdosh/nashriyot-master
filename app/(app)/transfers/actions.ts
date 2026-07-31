"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, assertRowAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { transferCreateSchema, settlementSchema } from "@/lib/validators/transfer";
import {
  createTransfer,
  shipTransfer,
  receiveTransfer,
  recordSettlement,
} from "@/lib/services/transfer-service";
import { suggestDiscountFor } from "@/lib/services/discount-service";

export async function createTransferAction(input: unknown) {
  const parsed = transferCreateSchema.parse(input);
  // Overriding the P_min floor on internal trade is an admin act.
  const user = parsed.overridePMin
    ? await requirePermission("transfers.override")
    : await requirePermission("transfers.write");
  assertRowAccess(user, { entityId: parsed.fromEntityId });
  const { order } = await createTransfer(parsed, user.id);
  revalidatePath("/transfers");
  return order.id;
}

export async function shipTransferAction(id: string) {
  const user = await requirePermission("transfers.write");
  const row = await prisma.transferOrder.findUniqueOrThrow({ where: { id }, select: { fromEntityId: true } });
  assertRowAccess(user, { entityId: row.fromEntityId });
  await shipTransfer(id, user.id);
  revalidatePath("/transfers");
}

export async function receiveTransferAction(id: string, fromWarehouseId: string, toWarehouseId: string) {
  const user = await requirePermission("transfers.write");
  const row = await prisma.transferOrder.findUniqueOrThrow({ where: { id }, select: { fromEntityId: true } });
  assertRowAccess(user, { entityId: row.fromEntityId });
  await receiveTransfer(id, { fromWarehouseId, toWarehouseId }, user.id);
  revalidatePath("/transfers");
  revalidatePath("/entities/ledger");
  revalidatePath("/inventory");
}

export async function recordSettlementAction(input: unknown) {
  const user = await requirePermission("finance.write");
  const parsed = settlementSchema.parse(input);
  assertRowAccess(user, { entityId: parsed.fromEntityId });
  await recordSettlement(parsed, user.id);
  revalidatePath("/entities/ledger");
}

/** Live discount preview for the transfer form (shows rate + source). */
export async function previewTransferDiscountAction(ctx: {
  titleId: string;
  toEntityId: string;
  qty: number;
}) {
  await requirePermission("transfers.read");
  const s = await suggestDiscountFor({ titleId: ctx.titleId, entityId: ctx.toEntityId, qty: ctx.qty });
  return { rate: s.rate.toNumber(), source: s.source };
}
