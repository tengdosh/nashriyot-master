"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { previewImport, commitImport } from "@/lib/services/import-service";
import type { TemplateName } from "@/lib/import-map";

const TEMPLATES: TemplateName[] = ["kirimlar", "sotuv"];

function assertTemplate(t: string): TemplateName {
  if (!TEMPLATES.includes(t as TemplateName)) throw new Error("Noma'lum shablon");
  return t as TemplateName;
}

export async function previewImportAction(template: string, csvText: string) {
  await requirePermission("admin.import");
  const p = await previewImport(assertTemplate(template), csvText);
  return { summary: p.summary, errors: p.errors, sampleCount: p.sample.length };
}

export async function commitImportAction(template: string, csvText: string) {
  const user = await requirePermission("admin.import");
  const r = await commitImport(assertTemplate(template), csvText, user.id);
  revalidatePath("/admin/import");
  return r;
}
