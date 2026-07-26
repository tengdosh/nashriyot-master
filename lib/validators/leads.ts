import { z } from "zod";

export const leadSourceEnum = z.enum(["INSTAGRAM", "TELEGRAM", "FACEBOOK", "REFERRAL", "WALK_IN", "OTHER"]);
export const lostReasonEnum = z.enum(["PRICE", "AVAILABILITY", "COMPETITOR", "NO_RESPONSE", "OTHER"]);

export const leadCreateSchema = z.object({
  source: leadSourceEnum,
  campaign: z.string().nullish(),
  contact: z.string().min(2, "Kontakt majburiy"),
  interestTitleId: z.string().nullish(),
  assigneeId: z.string().nullish(),
});

export const leadNoteSchema = z.object({
  leadId: z.string().min(1),
  text: z.string().min(1, "Izoh boʻsh boʻlmasin"),
});

export const leadLostSchema = z.object({
  leadId: z.string().min(1),
  lostReason: lostReasonEnum,
});

export const leadConvertSchema = z.object({
  leadId: z.string().min(1),
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  channelId: z.string().min(1),
  entityId: z.string().min(1),
  warehouseId: z.string().min(1),
  discountRate: z.number().min(0).max(0.99).optional(),
  deliveryCostUnit: z.number().nonnegative().optional(),
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadNoteInput = z.infer<typeof leadNoteSchema>;
export type LeadLostInput = z.infer<typeof leadLostSchema>;
export type LeadConvertInput = z.infer<typeof leadConvertSchema>;
