import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { deleteCostEntry } from "@/lib/services/cost-service";
import { ok, handleError } from "@/lib/api-response";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("acquisitions.write");
    const { id } = await params;
    await deleteCostEntry(id, user.id);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
