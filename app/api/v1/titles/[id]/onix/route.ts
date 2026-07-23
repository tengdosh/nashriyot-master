import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { generateOnix } from "@/lib/onix";
import { handleError } from "@/lib/api-response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("titles.read");
    const { id } = await params;
    const title = await prisma.title.findUniqueOrThrow({
      where: { id },
      include: {
        products: { take: 1, orderBy: { createdAt: "asc" } },
        contributors: { include: { contributor: true } },
        entity: true,
        ownerPartner: true,
      },
    });
    const product = title.products[0];
    const xml = generateOnix({
      isbn13: product?.isbn13 ?? null,
      title: title.workTitle,
      language: title.language === "uz" ? "uzb" : title.language,
      format: product?.format,
      contributors: title.contributors.map((tc) => ({ name: tc.contributor.fullName, role: tc.role })),
      publisher: title.entity?.name ?? title.ownerPartner?.name ?? null,
      listPriceUZS: product ? Number(product.listPrice) : null,
      annotation: title.description,
    });
    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (e) {
    return handleError(e);
  }
}
