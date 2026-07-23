import { z } from "zod";

export const COST_CATEGORIES = [
  "HUQUQ",
  "TARJIMA",
  "TAHRIR",
  "DIZAYN",
  "MUALLIF_BUYOUT",
  "BOSMA",
  "MARKETING_TITLE",
  "MARKETING_BRAND",
  "IJARA",
  "OYLIK",
  "KOMMUNAL",
  "BOSHQA",
] as const;

export const scenarioInputSchema = z.object({
  name: z.string().min(1, "Nom majburiy"),
  titleId: z.string().nullish(),
  editionId: z.string().nullish(),
  fixedCosts: z.array(z.object({ label: z.string(), amount: z.number().nonnegative() })).default([]),
  pagesCount: z.number().int().nonnegative(),
  perPageCost: z.number().nonnegative(),
  fixedPrintCost: z.number().nonnegative(),
  printRun: z.number().int().positive(),
  sellThroughRate: z.number().min(0.0001).max(1),
  discountRate: z.number().min(0).max(1),
  royaltyRate: z.number().min(0).max(1),
  targetMargin: z.number().min(0).max(1),
});
export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

export const scenarioSaveSchema = scenarioInputSchema.extend({
  id: z.string().nullish(),
  // client-computed results — the server recomputes and compares (guard).
  clientResults: z.object({ uc: z.number(), pmin: z.number(), rrp: z.number() }),
});
export type ScenarioSaveInput = z.infer<typeof scenarioSaveSchema>;

export const costEntrySchema = z.object({
  scope: z.enum(["TITLE", "EDITION", "FIXED"]),
  category: z.enum(COST_CATEGORIES),
  entityId: z.string().nullish(),
  titleId: z.string().nullish(),
  editionId: z.string().nullish(),
  amount: z.number().nonnegative(),
  currency: z.enum(["UZS", "USD", "TRY", "EUR"]).default("UZS"),
  rate: z.number().positive().default(1),
  date: z.string(),
  campaign: z.string().nullish(),
});
export type CostEntryInput = z.infer<typeof costEntrySchema>;
