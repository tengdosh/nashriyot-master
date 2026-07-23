import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { editionCreateSchema } from "@/lib/validators/title";
import { createEdition } from "@/lib/services/edition-service";
import { ok, handleError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("titles.write");
    const input = editionCreateSchema.parse(await req.json());
    const edition = await createEdition(input, user.id);
    return ok(edition, { created: true });
  } catch (e) {
    return handleError(e);
  }
}
