"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";
import { generateLinkCode } from "@/lib/services/telegram-service";

export async function generateTelegramCodeAction() {
  const user = await getSessionUser();
  if (!user) throw new Error("Avtorizatsiya talab qilinadi");
  const { code, expiresAt } = await generateLinkCode(user.id);
  revalidatePath("/profile");
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function unlinkTelegramAction() {
  const user = await getSessionUser();
  if (!user) throw new Error("Avtorizatsiya talab qilinadi");
  await prisma.telegramLink.deleteMany({ where: { userId: user.id } });
  revalidatePath("/profile");
}
