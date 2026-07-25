import { z } from "zod";

export const royaltyBasisEnum = z.enum(["LIST", "NET"]);
export const productFormatEnum = z.enum(["HARDCOVER", "PAPERBACK", "EBOOK", "AUDIO"]);

export const royaltyTierSchema = z.object({
  /** Null/omitted = the tier applies to every format. */
  format: productFormatEnum.nullish(),
  fromUnits: z.number().int().min(0),
  /** Null = open-ended; only the last tier of a format may be open. */
  toUnits: z.number().int().min(0).nullish(),
  rate: z.number().min(0).max(1),
  basis: royaltyBasisEnum.default("LIST"),
});

export const contractCreateSchema = z
  .object({
    contributorId: z.string().min(1),
    titleId: z.string().min(1, "Asar majburiy"),
    type: z.enum(["BUYOUT", "ROYALTY"]),
    advanceAmount: z.number().nonnegative().default(0),
    reserveRate: z.number().min(0).max(0.99).default(0),
    buyoutAmount: z.number().positive().nullish(),
    audioRights: z.boolean().default(false),
    tiers: z.array(royaltyTierSchema).default([]),
  })
  .refine((v) => v.type !== "BUYOUT" || (v.buyoutAmount ?? 0) > 0, {
    message: "BUYOUT shartnomada buyoutAmount majburiy",
    path: ["buyoutAmount"],
  })
  .refine((v) => v.type !== "ROYALTY" || v.tiers.length > 0, {
    message: "ROYALTY shartnomada kamida bitta tier kerak",
    path: ["tiers"],
  })
  .refine((v) => v.type !== "BUYOUT" || v.tiers.length === 0, {
    message: "BUYOUT shartnomada tier boʻlmaydi — dvigatel ishlamaydi",
    path: ["tiers"],
  });

export const contractUpdateSchema = z.object({
  id: z.string().min(1),
  advanceAmount: z.number().nonnegative().optional(),
  reserveRate: z.number().min(0).max(0.99).optional(),
  buyoutAmount: z.number().positive().nullish(),
  audioRights: z.boolean().optional(),
  tiers: z.array(royaltyTierSchema).optional(),
});

export const royaltyRunSchema = z.object({
  period: z.string().regex(/^\d{4}-(H[12]|Q[1-4]|M(0[1-9]|1[0-2]))$/, "Masalan: 2026-H1, 2026-Q3, 2026-M07"),
});

export type RoyaltyTierInput = z.infer<typeof royaltyTierSchema>;
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
export type RoyaltyRunInput = z.infer<typeof royaltyRunSchema>;
