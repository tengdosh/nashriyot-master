"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { prisma } from "@/lib/db";

export type LoginState = { error?: string };

// ─── Rate limiter: 5 attempts per 15 min per IP+email (DB-backed, restart-safe) ──
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

async function isRateLimited(ip: string, email: string): Promise<boolean> {
  const key = `${ip}:${email.toLowerCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_MS);

  const existing = await prisma.loginAttempt.findUnique({ where: { key } });

  if (!existing || existing.expiresAt < now) {
    // First attempt or window expired — create/reset
    await prisma.loginAttempt.upsert({
      where: { key },
      update: { count: 1, firstAt: now, expiresAt },
      create: { key, count: 1, firstAt: now, expiresAt },
    });
    return false;
  }

  if (existing.count >= MAX_ATTEMPTS) return true;

  await prisma.loginAttempt.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return false;
}

// Lazy cleanup of expired rows (runs ~1% of the time, async, non-blocking)
function maybeCleanExpired() {
  if (Math.random() > 0.01) return;
  prisma.loginAttempt
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const reqHeaders = await headers();
  const ip =
    reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    reqHeaders.get("x-real-ip") ??
    "unknown";
  const email = String(formData.get("email") ?? "");

  maybeCleanExpired();

  if (await isRateLimited(ip, email)) {
    return { error: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." };
  }

  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirectTo: "/nashriyot-master/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email yoki parol noto'g'ri" };
    }
    // signIn throws a redirect on success — re-throw so Next handles it.
    throw error;
  }
}
