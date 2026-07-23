"use server";

import { revalidatePath } from "next/cache";
import type { TitleStatus } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { titleCreateSchema, editionCreateSchema, productCreateSchema } from "@/lib/validators/title";
import { createTitle, transitionTitle } from "@/lib/services/title-service";
import { createEdition, createProduct } from "@/lib/services/edition-service";
import { isValidIsbn13 } from "@/lib/isbn";

export async function createTitleAction(input: unknown): Promise<{ id: string }> {
  const user = await requirePermission("titles.write");
  const data = titleCreateSchema.parse(input);
  const title = await createTitle(data, user.id);
  revalidatePath("/titles");
  return { id: title.id };
}

export async function transitionAction(titleId: string, to: TitleStatus, reason?: string) {
  const user = await requirePermission("titles.transition");
  await transitionTitle(titleId, to, user.id, reason ?? null);
  revalidatePath(`/titles/${titleId}`);
}

export async function createEditionAction(titleId: string, plannedRun: number, notes?: string) {
  const user = await requirePermission("titles.write");
  const data = editionCreateSchema.parse({ titleId, plannedRun, notes: notes ?? null });
  const ed = await createEdition(data, user.id);
  revalidatePath(`/titles/${titleId}`);
  return { id: ed.id, editionNo: ed.editionNo };
}

export async function createProductAction(input: unknown): Promise<{ id: string }> {
  const user = await requirePermission("titles.write");
  const data = productCreateSchema.parse(input);
  if (data.isbn13 && !isValidIsbn13(data.isbn13)) {
    throw new Error("ISBN-13 notoʻgʻri (nazorat raqami mos emas)");
  }
  const p = await createProduct(data, user.id);
  revalidatePath(`/titles/${data.titleId}`);
  return { id: p.id };
}
