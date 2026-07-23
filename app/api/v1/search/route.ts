import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { searchTitles } from "@/lib/services/edition-service";
import { ok, handleError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("titles.read");
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const results = await searchTitles(q, user.entityAccess);
    return ok(results);
  } catch (e) {
    return handleError(e);
  }
}
