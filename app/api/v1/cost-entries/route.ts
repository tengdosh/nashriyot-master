// check:entity-ok: entityId is used only as a read-path filter (GET where clause), not in writes
import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { costEntrySchema } from "@/lib/validators/acquisition";
import { createCostEntry, listCostEntries } from "@/lib/services/cost-service";
import { ok, handleError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("acquisitions.read");
    const sp = req.nextUrl.searchParams;
    const where: Parameters<typeof listCostEntries>[0] = {};
    if (sp.get("titleId")) where.titleId = sp.get("titleId")!;
    if (sp.get("editionId")) where.editionId = sp.get("editionId")!;
    if (sp.get("entityId")) where.entityId = sp.get("entityId")!;
    const scope = sp.get("scope");
    if (scope === "TITLE" || scope === "EDITION" || scope === "FIXED") where.scope = scope;
    return ok(await listCostEntries(where));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("acquisitions.write");
    const input = costEntrySchema.parse(await req.json());
    return ok(await createCostEntry(input, user.id), { created: true });
  } catch (e) {
    return handleError(e);
  }
}
