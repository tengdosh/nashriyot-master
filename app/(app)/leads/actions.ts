"use server";

import { revalidatePath } from "next/cache";
import type { LeadStatus, LostReason } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { leadCreateSchema, leadNoteSchema, leadConvertSchema } from "@/lib/validators/leads";
import { createLead, moveLead, addNote, convertToOrder } from "@/lib/services/leads-service";

export async function createLeadAction(input: unknown) {
  const user = await requirePermission("leads.write");
  await createLead(leadCreateSchema.parse(input), user.id);
  revalidatePath("/leads");
}

export async function moveLeadAction(leadId: string, to: LeadStatus, lostReason?: LostReason) {
  const user = await requirePermission("leads.write");
  await moveLead(leadId, to, user.id, lostReason);
  revalidatePath("/leads");
}

export async function addNoteAction(input: unknown) {
  const user = await requirePermission("leads.write");
  await addNote(leadNoteSchema.parse(input), user.id);
  revalidatePath("/leads");
}

export async function convertLeadAction(input: unknown) {
  const user = await requirePermission("leads.write");
  const order = await convertToOrder(leadConvertSchema.parse(input), user.id);
  revalidatePath("/leads");
  revalidatePath("/sales/orders");
  return order.id;
}
