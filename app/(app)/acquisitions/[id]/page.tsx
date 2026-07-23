import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { ScenarioEditor } from "../scenario-editor";

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("acquisitions.read");
  const { id } = await params;
  const s = await prisma.plScenario.findUnique({ where: { id } });
  if (!s) notFound();

  const titles = await prisma.title.findMany({
    where: { archivedAt: null, OR: [{ entityId: { in: user.entityAccess } }, { entityId: null }] },
    select: { id: true, workTitle: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const existing = {
    id: s.id,
    name: s.name,
    titleId: s.titleId,
    fixedCosts: (s.fixedCosts as { label: string; amount: number }[]) ?? [],
    pagesCount: s.pagesCount,
    perPageCost: Number(s.perPageCost),
    fixedPrintCost: Number(s.fixedPrintCost),
    printRun: s.printRun,
    sellThroughRate: Number(s.sellThroughRate),
    discountRate: Number(s.discountRate),
    royaltyRate: Number(s.royaltyRate),
    targetMargin: Number(s.targetMargin),
    approved: !!s.editionId,
  };

  return <ScenarioEditor titles={titles} existing={existing} />;
}
