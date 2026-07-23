import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthzError } from "@/lib/rbac";
import { TransitionError } from "@/lib/services/title-service";

// Uniform API envelope (spec §3.3): { data, error, meta }.
export function ok<T>(data: T, meta?: unknown) {
  return NextResponse.json({ data, error: null, meta: meta ?? null });
}

export function fail(code: string, message: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message }, meta: null }, { status });
}

export function handleError(e: unknown) {
  if (e instanceof AuthzError) {
    return fail(e.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", e.message, e.status);
  }
  if (e instanceof ZodError) {
    return fail("VALIDATION", e.issues.map((i) => i.message).join("; "), 400);
  }
  if (e instanceof TransitionError) {
    return fail("TRANSITION", e.message, 409);
  }
  const message = e instanceof Error ? e.message : "Server xatosi";
  return fail("ERROR", message, 400);
}
