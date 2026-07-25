import { z } from "zod";

export const salesOrderLineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive("Miqdor 0 dan katta boʻlishi kerak"),
  /** Omit to take the product's list price. */
  unitPrice: z.number().nonnegative().optional(),
  /** Omit to take suggestDiscount(); passing a value still gets P_min-checked. */
  discountRate: z.number().min(0).max(0.99).optional(),
  deliveryCostUnit: z.number().nonnegative().optional(),
});

export const salesOrderCreateSchema = z.object({
  channelId: z.string().min(1),
  // v2 §6: entity is MANDATORY on an order — every sale belongs to a subject.
  entityId: z.string().min(1, "Sub'ekt majburiy"),
  warehouseId: z.string().min(1),
  partnerId: z.string().nullish(),
  customerName: z.string().nullish(),
  dueDate: z.string().nullish(),
  deliveryProvider: z.string().nullish(),
  lines: z.array(salesOrderLineSchema).min(1, "Kamida bitta qator kerak"),
  /** Admin-only escape hatch for a P_min violation; always audited. */
  overridePMin: z.boolean().optional(),
});

export const returnCreateSchema = z.object({
  orderLineId: z.string().min(1),
  qty: z.number().int().positive(),
  condition: z.enum(["SELLABLE", "DAMAGED"]),
});

export const paymentRegisterSchema = z.object({
  receivableId: z.string().min(1),
  amountUZS: z.number().positive("Toʻlov summasi 0 dan katta boʻlishi kerak"),
  method: z.enum(["CASH", "CARD", "BANK"]).default("BANK"),
});

export const channelUpdateSchema = z.object({
  id: z.string().min(1),
  defaultDiscount: z.number().min(0).max(0.99),
  feeRate: z.number().min(0).max(0.99),
  paymentTermDays: z.number().int().min(0),
});

export type SalesOrderLineInput = z.infer<typeof salesOrderLineSchema>;
export type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;
export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;
export type PaymentRegisterInput = z.infer<typeof paymentRegisterSchema>;
export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>;
