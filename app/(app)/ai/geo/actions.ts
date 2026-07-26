"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  generateGeoRecommendation,
  approveGeoAnnotation,
  getGeoDetail,
  GeoUnavailableError,
} from "@/lib/services/geo-service";

export async function loadGeoAction(titleId: string) {
  await requirePermission("ai.read");
  return getGeoDetail(titleId);
}

export async function generateGeoAction(titleId: string) {
  const user = await requirePermission("ai.read");
  try {
    await generateGeoRecommendation(titleId, user.id);
  } catch (e) {
    if (e instanceof GeoUnavailableError) return { ok: false, unavailable: true, error: e.message };
    throw e;
  }
  revalidatePath("/ai/geo");
  return { ok: true };
}

export async function approveGeoAction(id: string) {
  const user = await requirePermission("ai.apply");
  await approveGeoAnnotation(id, user.id);
  revalidatePath("/ai/geo");
  return { ok: true };
}
