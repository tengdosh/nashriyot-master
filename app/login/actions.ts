"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { isRateLimited, maybeCleanExpired } from "@/lib/login-rate-limit";

export type LoginState = { error?: string };

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
