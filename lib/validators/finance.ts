import { z } from "zod";

/** Manual AP entry (spec v2 §5.4): printing / commission / rights / other. */
export const payableCreateSchema = z.object({
  partnerId: z.string().min(1, "Hamkor tanlanishi kerak"),
  type: z.enum(["COMMISSION_BOOKS", "PRINTING", "RIGHTS", "OTHER"]),
  amount: z.number().positive("Summa 0 dan katta boʻlishi kerak"),
  currency: z.enum(["UZS", "USD", "TRY", "EUR"]).default("UZS"),
  rate: z.number().positive("Kurs 0 dan katta boʻlishi kerak").default(1),
  dueDate: z.string().optional(),
  note: z.string().max(500).optional(),
});

/** Close (fully or partly) a payable with an OUT payment. */
export const payablePaySchema = z.object({
  payableId: z.string().min(1),
  amountUZS: z.number().positive("Toʻlov summasi 0 dan katta boʻlishi kerak"),
  entityId: z.string().min(1, "Toʻlovchi tashkilot tanlanishi kerak"),
  method: z.enum(["CASH", "CARD", "BANK"]).default("BANK"),
});

/** Confirm a reconciliation pairing (auto or manual). */
export const reconMatchSchema = z.object({
  paymentId: z.string().min(1),
  bankRef: z.string().min(1, "Bank hujjati raqami kerak"),
});

export type PayableCreateInput = z.infer<typeof payableCreateSchema>;
export type PayablePayInput = z.infer<typeof payablePaySchema>;
export type ReconMatchInput = z.infer<typeof reconMatchSchema>;
