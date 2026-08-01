import type { NextRequest } from "next/server";
import { requirePermission, assertRowAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { deleteCostEntry } from "@/lib/services/cost-service";
import { ok, handleError } from "@/lib/api-response";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("acquisitions.write");
    const { id } = await params;
    const entry = await prisma.costEntry.findUnique({ where: { id }, select: { entityId: true } });
    assertRowAccess(user, { entityId: entry?.entityId });
    await deleteCostEntry(id, user.id);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
