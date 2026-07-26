import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ReportError, type ReportCaller } from "@/lib/services/reports-service";

/**
 * Two ways to authenticate a reports request (playbook "Auth"):
 *  1. Bearer REPORTS_API_TOKEN + `x-user-id` header — the bot path. The token
 *     only unlocks reports.* ; the acting user is loaded from the DB and THEIR
 *     permissions + entity access are enforced (spec §5.3).
 *  2. A logged-in session with reports.read — the in-app path.
 *
 * Either way we return a ReportCaller whose scope the report layer cannot widen.
 */

/** True when the request carries the valid bot service token. */
export function hasValidServiceToken(req: NextRequest): boolean {
  const expected = process.env.REPORTS_API_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m != null && timingSafeEqual(m[1], expected);
}

// Constant-time-ish compare so a wrong token can't be guessed by timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Load a user's permissions + entity access by id (bot path). */
export async function callerFromUserId(userId: string): Promise<ReportCaller> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      entityAccess: { select: { id: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user || !user.isActive) throw new ReportError("Foydalanuvchi topilmadi yoki faol emas", 401);

  const permissions = Array.from(
    new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
  );
  return { id: user.id, permissions, entityAccess: user.entityAccess.map((e) => e.id) };
}

/** Resolve the caller for a reports request via token+userId or session. */
export async function resolveReportCaller(req: NextRequest): Promise<ReportCaller> {
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    if (!hasValidServiceToken(req)) throw new ReportError("Token yaroqsiz", 401);
    const userId = req.headers.get("x-user-id");
    if (!userId) throw new ReportError("x-user-id sarlavhasi majburiy", 400);
    return callerFromUserId(userId);
  }

  // Session path.
  const { auth } = await import("@/auth");
  const session = await auth();
  const u = session?.user;
  if (!u) throw new ReportError("Avtorizatsiya talab qilinadi", 401);
  if (!u.permissions?.includes("reports.read")) throw new ReportError("reports.read ruxsati yo'q", 403);
  return { id: u.id, permissions: u.permissions ?? [], entityAccess: u.entityAccess ?? [] };
}
