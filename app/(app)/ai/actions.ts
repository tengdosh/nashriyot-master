"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { buildForecast, applyForecastToReorder } from "@/lib/services/forecast-service";
import { suggestPriceFor, acceptPrice, rejectPrice } from "@/lib/services/pricing-service";

export async function buildForecastAction(productId: string) {
  const user = await requirePermission("ai.read");
  const f = await buildForecast(productId, user.id);
  revalidatePath("/ai/forecast");
  if (!f) return { ok: false as const, reason: "AI xizmati javob bermadi" };
  return { ok: true as const, forecastId: f.id };
}

/** Applying a forecast to a reorder rule is an ai.apply action (human step). */
export async function applyForecastAction(forecastId: string) {
  const user = await requirePermission("ai.apply");
  await applyForecastToReorder(forecastId, user.id);
  revalidatePath("/ai/forecast");
  revalidatePath("/inventory");
}

export async function suggestPriceAction(productId: string) {
  const user = await requirePermission("ai.read");
  const res = await suggestPriceFor(productId, user.id);
  revalidatePath("/ai/pricing");
  if (res === null) return { ok: false as const, reason: "AI xizmati javob bermadi" };
  if (res.skipped) return { ok: true as const, skipped: true as const, reason: res.reason };
  return { ok: true as const, skipped: false as const, recId: res.recommendation.id };
}

export async function acceptPriceAction(recId: string) {
  const user = await requirePermission("ai.apply");
  await acceptPrice(recId, user.id);
  revalidatePath("/ai/pricing");
  revalidatePath("/titles");
}

export async function rejectPriceAction(recId: string) {
  const user = await requirePermission("ai.read");
  await rejectPrice(recId, user.id);
  revalidatePath("/ai/pricing");
}
