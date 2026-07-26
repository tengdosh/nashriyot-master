"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/rbac";
import { normalizeLayout, type WidgetLayout } from "@/lib/dashboard";
import { saveLayout, resetLayout } from "@/lib/services/dashboard-service";

async function requireUser() {
  const user = await getSessionUser();
  if (!user?.id) throw new Error("Avtorizatsiya talab qilinadi");
  return user;
}

export async function saveLayoutAction(widgets: WidgetLayout[]) {
  const user = await requireUser();
  // Re-normalize server-side — the client layout is a preference, not trusted.
  await saveLayout(user.id, normalizeLayout(widgets));
  revalidatePath("/dashboard");
}

export async function resetLayoutAction() {
  const user = await requireUser();
  await resetLayout(user.id);
  revalidatePath("/dashboard");
}
