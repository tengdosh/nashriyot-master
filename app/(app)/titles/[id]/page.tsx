import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { titleUniqueCost } from "@/lib/services/edition-service";
import { TITLE_FLOW, isBackward } from "@/lib/services/title-service";
import { TitleDetail } from "./title-detail";

export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("titles.read");
  const { id } = await params;

  const title = await prisma.title.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      ownerPartner: { select: { name: true } },
      series: { select: { name: true } },
      editions: {
        orderBy: { editionNo: "asc" },
        include: { _count: { select: { printOrders: true, products: true } } },
      },
      products: {
        orderBy: { createdAt: "asc" },
        include: { edition: { select: { editionNo: true } } },
      },
      contributors: { include: { contributor: { select: { fullName: true } } } },
      costEntries: { where: { scope: "TITLE" }, orderBy: { date: "desc" } },
    },
  });
  if (!title) notFound();
  const eIds = entityFilter(user);
  if (eIds !== null && title.entityId && !eIds.includes(title.entityId)) notFound();

  const [uniqueCost, audit] = await Promise.all([
    titleUniqueCost(id),
    prisma.auditLog.findMany({
      where: { entity: "Title", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { user: { select: { fullName: true } } },
    }),
  ]);

  const data = {
    id: title.id,
    workTitle: title.workTitle,
    status: title.status,
    ownerType: title.ownerType,
    entityName: title.entity?.name ?? null,
    ownerPartnerName: title.ownerPartner?.name ?? null,
    seriesName: title.series?.name ?? null,
    language: title.language,
    description: title.description,
    keywords: title.keywords,
    themaCodes: title.themaCodes,
    bisacCodes: title.bisacCodes,
    uniqueCost: Number(uniqueCost),
    editions: title.editions.map((e) => ({
      id: e.id,
      editionNo: e.editionNo,
      plannedRun: e.plannedRun,
      status: e.status,
      printOrders: e._count.printOrders,
      products: e._count.products,
    })),
    products: title.products.map((p) => ({
      id: p.id,
      format: p.format,
      isbn13: p.isbn13,
      listPrice: Number(p.listPrice),
      editionNo: p.edition?.editionNo ?? null,
    })),
    contributors: title.contributors.map((c) => ({ id: c.id, name: c.contributor.fullName, role: c.role })),
    costEntries: title.costEntries.map((c) => ({
      id: c.id,
      category: c.category,
      amountUZS: Number(c.amountUZS),
      date: c.date.toISOString(),
    })),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      at: a.createdAt.toISOString(),
      user: a.user?.fullName ?? "—",
      after: a.after as Record<string, unknown> | null,
    })),
  };

  const allowedTransitions = (TITLE_FLOW[title.status] ?? []).map((to) => ({
    to,
    backward: isBackward(title.status, to),
  }));

  return (
    <TitleDetail
      title={data}
      allowedTransitions={allowedTransitions}
      canWrite={user.permissions.includes("titles.write")}
      canTransition={user.permissions.includes("titles.transition")}
    />
  );
}
