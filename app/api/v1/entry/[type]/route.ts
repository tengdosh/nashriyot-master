/**
 * POST /api/v1/entry/:type
 * Tez kiritish API — mobil PWA uchun.
 * type: sale | payment | expense | transfer
 * Auth: requirePermission('entry.write')
 * Idempotentlik: x-client-request-id header (15 daqiqa TTL, in-memory Set)
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { ok, fail, handleError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { createSalesOrder } from "@/lib/services/sales-service";
import { confirmSalesOrder, shipSalesOrder } from "@/lib/services/sales-service";
import { createCostEntry } from "@/lib/services/cost-service";
import { createTransfer } from "@/lib/services/transfer-service";

// ─── Idempotentlik (15 daqiqa TTL) ───────────────────────────────────────────
const SEEN = new Map<string, number>();
const TTL_MS = 15 * 60 * 1000;

function isDuplicate(id: string): boolean {
  const seen = SEEN.get(id);
  if (seen && Date.now() - seen < TTL_MS) return true;
  SEEN.set(id, Date.now());
  // Eski yozuvlarni tozalash
  if (SEEN.size > 10_000) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, ts] of SEEN) {
      if (ts < cutoff) SEEN.delete(k);
    }
  }
  return false;
}

// ─── Zod sxemalari ───────────────────────────────────────────────────────────

const saleSchema = z.object({
  productId: z.string().min(1, "Mahsulot tanlanishi kerak"),
  qty: z.number().int().positive("Miqdor 0 dan katta bo'lishi kerak"),
  unitPrice: z.number().nonnegative("Narx manfiy bo'lmasligi kerak"),
  channelId: z.string().min(1, "Kanal tanlanishi kerak"),
  entityId: z.string().min(1, "Sub'ekt tanlanishi kerak"),
  warehouseId: z.string().min(1, "Ombor tanlanishi kerak"),
  overridePMin: z.boolean().optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive("Summa 0 dan katta bo'lishi kerak"),
  direction: z.enum(["IN", "OUT"]),
  method: z.enum(["CASH", "CARD", "BANK"]),
  entityId: z.string().min(1, "Sub'ekt tanlanishi kerak"),
  note: z.string().max(500).optional(),
});

const expenseSchema = z.object({
  amount: z.number().positive("Miqdor 0 dan katta bo'lishi kerak"),
  category: z.string().min(1, "Kategoriya tanlanishi kerak"),
  date: z.string().min(1, "Sana tanlanishi kerak"),
  note: z.string().max(500).optional(),
  entityId: z.string().nullish(),
});

const transferSchema = z.object({
  productId: z.string().min(1, "Mahsulot tanlanishi kerak"),
  qty: z.number().int().positive("Miqdor 0 dan katta bo'lishi kerak"),
  fromEntityId: z.string().min(1, "Manba sub'ekt tanlanishi kerak"),
  toEntityId: z.string().min(1, "Manzil sub'ekt tanlanishi kerak"),
  fromWarehouseId: z.string().min(1, "Manba ombor tanlanishi kerak"),
  toWarehouseId: z.string().min(1, "Manzil ombor tanlanishi kerak"),
  note: z.string().max(500).optional(),
});

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const user = await requirePermission("entry.write");
    const { type } = await params;

    // Idempotentlik tekshiruvi
    const clientRequestId = req.headers.get("x-client-request-id");
    if (clientRequestId && isDuplicate(clientRequestId)) {
      return fail("DUPLICATE", "Bu so'rov allaqachon yuborilgan (idempotent)", 409);
    }

    const body = await req.json();

    switch (type) {
      case "sale": {
        const input = saleSchema.parse(body);
        // SalesOrder DRAFT yaratish → CONFIRMED → SHIPPED zanjiri
        const { order } = await createSalesOrder(
          {
            channelId: input.channelId,
            entityId: input.entityId,
            warehouseId: input.warehouseId,
            lines: [{ productId: input.productId, qty: input.qty, unitPrice: input.unitPrice }],
            overridePMin: input.overridePMin,
          },
          user.id,
        );
        // DRAFT → CONFIRMED → SHIPPED
        await confirmSalesOrder(order.id, user.id);
        const shipped = await shipSalesOrder(order.id, user.id);
        return ok({ orderId: shipped.orderId, status: "SHIPPED" }, { created: true });
      }

      case "payment": {
        const input = paymentSchema.parse(body);
        const payment = await runWithAudit({ userId: user.id }, async () => {
          return await prisma.payment.create({
            data: {
              direction: input.direction,
              method: input.method,
              entityId: input.entityId,
              amount: new Prisma.Decimal(input.amount),
              currency: "UZS",
              date: new Date(),
              refType: input.note ? "Manual" : null,
            },
          });
        });
        return ok({ paymentId: payment.id }, { created: true });
      }

      case "expense": {
        const input = expenseSchema.parse(body);
        // Kategoriyani mavjud enum qiymatlariga moslashtirish
        const validCategories = [
          "HUQUQ", "TARJIMA", "TAHRIR", "DIZAYN", "MUALLIF_BUYOUT",
          "BOSMA", "MARKETING_TITLE", "MARKETING_BRAND", "IJARA",
          "OYLIK", "KOMMUNAL", "BOSHQA",
        ] as const;
        const category = validCategories.includes(input.category as (typeof validCategories)[number])
          ? (input.category as (typeof validCategories)[number])
          : ("BOSHQA" as const);

        const entry = await createCostEntry(
          {
            scope: "FIXED",
            category,
            entityId: input.entityId ?? undefined,
            amount: input.amount,
            currency: "UZS",
            rate: 1,
            date: input.date,
            campaign: input.note ?? null,
          },
          user.id,
        );
        return ok({ entryId: entry.id }, { created: true });
      }

      case "transfer": {
        const input = transferSchema.parse(body);
        // TransferOrder DRAFT yaratish
        const { order: transferOrder } = await createTransfer(
          {
            fromEntityId: input.fromEntityId,
            toEntityId: input.toEntityId,
            fromWarehouseId: input.fromWarehouseId,
            toWarehouseId: input.toWarehouseId,
            lines: [{ productId: input.productId, qty: input.qty }],
          },
          user.id,
        );
        return ok({ transferId: transferOrder.id }, { created: true });
      }

      default:
        return fail("NOT_FOUND", `Noma'lum type: ${type}`, 404);
    }
  } catch (e) {
    return handleError(e);
  }
}
