// check:entity-ok: entityId used only as GET entity-access filter; title creation is acquisitions-admin act
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { titleCreateSchema } from "@/lib/validators/title";
import { createTitle } from "@/lib/services/title-service";
import { ok, handleError } from "@/lib/api-response";

export async function GET() {
  try {
    const user = await requirePermission("titles.read");
    const titles = await prisma.title.findMany({
      where: { archivedAt: null, OR: [{ entityId: { in: user.entityAccess } }, { entityId: null }] },
      include: {
        entity: { select: { code: true } },
        _count: { select: { products: true, editions: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return ok(titles);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("titles.write");
    const input = titleCreateSchema.parse(await req.json());
    const title = await createTitle(input, user.id);
    return ok(title, { created: true });
  } catch (e) {
    return handleError(e);
  }
}
