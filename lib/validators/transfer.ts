import { z } from "zod";

export const transferLineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive("Miqdor 0 dan katta boʻlishi kerak"),
  /** Omit to take the product's list price as the base. */
  basePrice: z.number().nonnegative().optional(),
  /** Omit to take suggestDiscount(); a manual value is still P_min-checked. */
  discountRate: z.number().min(0).max(0.99).optional(),
});

export const transferCreateSchema = z
  .object({
    fromEntityId: z.string().min(1),
    toEntityId: z.string().min(1),
    fromWarehouseId: z.string().min(1),
    toWarehouseId: z.string().min(1),
    lines: z.array(transferLineSchema).min(1, "Kamida bitta qator kerak"),
    overridePMin: z.boolean().optional(),
  })
  .refine((v) => v.fromEntityId !== v.toEntityId, {
    message: "Chiquvchi va qabul qiluvchi sub'ekt bir xil boʻlmasligi kerak",
    path: ["toEntityId"],
  });

export const settlementSchema = z
  .object({
    fromEntityId: z.string().min(1),
    toEntityId: z.string().min(1),
    amountUZS: z.number().positive("Summa 0 dan katta boʻlishi kerak"),
    note: z.string().optional(),
  })
  .refine((v) => v.fromEntityId !== v.toEntityId, {
    message: "Toʻlovchi va oluvchi bir xil boʻlmasligi kerak",
    path: ["toEntityId"],
  });

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
