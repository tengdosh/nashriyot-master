"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";

export type LoginState = { error?: string };

// ─── Rate limiter: 5 attempts per 15 min per IP+email ────────────────────────
const ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string, email: string): boolean {
  const key = `${ip}:${email.toLowerCase()}`;
  const now = Date.now();
  const rec = ATTEMPTS.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    ATTEMPTS.set(key, { count: 1, firstAt: now });
    return false;
  }
  rec.count += 1;
  if (rec.count > MAX) return true;
  return false;
}

// Stale entry cleanup (lazy, triggered 1/100 calls)
function maybeCleanup() {
  if (Math.random() > 0.01) return;
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of ATTEMPTS) {
    if (v.firstAt < cutoff) ATTEMPTS.delete(k);
  }
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

  maybeCleanup();
  if (checkRateLimit(ip, email)) {
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
