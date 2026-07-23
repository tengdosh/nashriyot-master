import { z } from "zod";

export const printOrderCreateSchema = z.object({
  editionId: z.string(),
  productId: z.string(),
  printerId: z.string(),
  quantity: z.number().int().positive(),
  unitPPB: z.number().nonnegative(),
  fixedCost: z.number().nonnegative().default(0),
  currency: z.enum(["UZS", "USD", "TRY", "EUR"]).default("UZS"),
  rate: z.number().positive().default(1),
  expectedDate: z.string().nullish(),
});
export type PrintOrderCreateInput = z.infer<typeof printOrderCreateSchema>;

export const printTransitionSchema = z.object({ to: z.enum(["APPROVED", "PRINTING", "RECEIVED"]) });

export const receiveSchema = z.object({
  actualQty: z.number().int().positive(),
  warehouseId: z.string(),
});

export const taskCreateSchema = z.object({
  titleId: z.string(),
  name: z.string().min(1),
  assigneeId: z.string().nullish(),
  startDate: z.string().nullish(),
  dueDate: z.string().nullish(),
  dependsOnId: z.string().nullish(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z.object({
  name: z.string().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "IN_REVIEW", "DONE"]).nullish(),
  assigneeId: z.string().nullish(),
  dueDate: z.string().nullish(),
  dependsOnId: z.string().nullish(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
