import { z } from "zod";

export const inviteUserSchema = z.object({
  email: z.string().email("Email notoʻgʻri"),
  fullName: z.string().min(2, "Ism kamida 2 belgi"),
  roleCode: z.string().min(1, "Rol majburiy"),
  entityIds: z.array(z.string()).default([]),
});

export const setUserRolesSchema = z.object({
  userId: z.string().min(1),
  roleCode: z.string().min(1),
  entityIds: z.array(z.string()).default([]),
});

export const setRolePermsSchema = z.object({
  roleCode: z.string().min(1),
  permCodes: z.array(z.string()),
});

/** Editable admin settings (spec §5.11). Ranges mirror the inventory knobs. */
export const adminSettingsSchema = z.object({
  vatRate: z.number().min(0).max(1),
  deadStockDays: z.number().int().positive(),
  carryingRate: z.number().min(0).max(1),
  expectedROI: z.number().min(0).max(1),
  serviceLevelZ: z.number().min(0).max(5),
  orderCost: z.number().nonnegative(),
  minTurnover: z.number().min(0),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
export type SetRolePermsInput = z.infer<typeof setRolePermsSchema>;
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;
