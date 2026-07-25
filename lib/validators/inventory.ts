import { z } from "zod";

/** ADJUST needs a reason — an unexplained correction is a hole in the audit trail. */
export const adjustSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.number().int().refine((n) => n !== 0, "Tuzatish miqdori 0 boʻlishi mumkin emas"),
  reason: z.string().min(3, "Sabab kamida 3 belgi"),
});

export const transferSchema = z
  .object({
    productId: z.string().min(1),
    fromWarehouseId: z.string().min(1),
    toWarehouseId: z.string().min(1),
    qty: z.number().int().positive("Miqdor 0 dan katta boʻlishi kerak"),
    reason: z.string().min(3, "Sabab kamida 3 belgi"),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Chiqish va kirish ombori bir xil boʻlmasligi kerak",
    path: ["toWarehouseId"],
  });

export const returnSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  qty: z.number().int().positive(),
  condition: z.enum(["SELLABLE", "DAMAGED"]),
  reason: z.string().optional(),
});

export const disposalActionEnum = z.enum([
  "PRICE_CUT",
  "BUNDLE",
  "RETURN_TO_SUPPLIER",
  "WHOLESALE",
  "DONATION",
  "WRITE_OFF",
]);

export const writeDownSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  qty: z.number().int().positive(),
  action: disposalActionEnum.optional(),
  reason: z.string().min(3, "Sabab kamida 3 belgi"),
});

export const deadStockSettingsSchema = z.object({
  deadStockDays: z.number().int().positive(),
  carryingRate: z.number().min(0).max(1),
  expectedROI: z.number().min(0).max(1),
  minTurnover: z.number().min(0),
});

export type AdjustInput = z.infer<typeof adjustSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type WriteDownInput = z.infer<typeof writeDownSchema>;
export type DeadStockSettingsInput = z.infer<typeof deadStockSettingsSchema>;
