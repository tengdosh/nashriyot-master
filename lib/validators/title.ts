import { z } from "zod";

export const titleCreateSchema = z
  .object({
    workTitle: z.string().min(2, "Sarlavha juda qisqa"),
    ownerType: z.enum(["OWN", "EXTERNAL"]).default("OWN"),
    entityId: z.string().nullish(),
    ownerPartnerId: z.string().nullish(),
    language: z.string().default("uz"),
    seriesId: z.string().nullish(),
    description: z.string().nullish(),
    keywords: z.array(z.string()).default([]),
    themaCodes: z.array(z.string()).default([]),
    bisacCodes: z.array(z.string()).default([]),
  })
  .refine((d) => d.ownerType !== "EXTERNAL" || !!d.ownerPartnerId, {
    message: "EXTERNAL kitob uchun egasi (nashriyot) majburiy",
    path: ["ownerPartnerId"],
  })
  .refine((d) => d.ownerType !== "OWN" || !!d.entityId, {
    message: "OWN kitob uchun subʼekt majburiy",
    path: ["entityId"],
  });
export type TitleCreateInput = z.infer<typeof titleCreateSchema>;

export const productCreateSchema = z.object({
  titleId: z.string(),
  editionId: z.string().nullish(),
  format: z.enum(["HARDCOVER", "PAPERBACK", "EBOOK", "AUDIO"]),
  isbn13: z.string().nullish(),
  sku: z.string().nullish(),
  listPrice: z.number().nonnegative(),
  pages: z.number().int().positive().nullish(),
  vatRate: z.number().min(0).max(1).default(0),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const editionCreateSchema = z.object({
  titleId: z.string(),
  plannedRun: z.number().int().positive(),
  notes: z.string().nullish(),
});
export type EditionCreateInput = z.infer<typeof editionCreateSchema>;

export const transitionSchema = z.object({
  to: z.enum(["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "OUT_OF_PRINT"]),
  reason: z.string().nullish(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;
