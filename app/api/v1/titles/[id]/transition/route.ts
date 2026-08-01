import type { NextRequest } from "next/server";
import { requirePermission, assertRowAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { transitionSchema } from "@/lib/validators/title";
import { transitionTitle } from "@/lib/services/title-service";
import { ok, handleError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("titles.transition");
    const { id } = await params;
    const titleRow = await prisma.title.findUnique({ where: { id }, select: { entityId: true } });
    assertRowAccess(user, { entityId: titleRow?.entityId });
    const { to, reason } = transitionSchema.parse(await req.json());
    const title = await transitionTitle(id, to, user.id, reason);
    return ok(title);
  } catch (e) {
    return handleError(e);
  }
}
