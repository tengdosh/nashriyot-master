import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { TitlesTable, type TitleRow } from "./titles-table";

export const metadata = { title: "Sarlavhalar" };

export default async function TitlesPage() {
  const user = await requirePermission("titles.read");

  const titles = await prisma.title.findMany({
    where: { archivedAt: null, OR: [{ entityId: { in: user.entityAccess } }, { entityId: null }] },
    include: {
      entity: { select: { code: true } },
      contributors: { include: { contributor: { select: { fullName: true } } }, take: 3 },
      products: { select: { format: true } },
      _count: { select: { editions: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const rows: TitleRow[] = titles.map((t) => ({
    id: t.id,
    workTitle: t.workTitle,
    status: t.status,
    ownerType: t.ownerType,
    entity: t.entity?.code ?? (t.ownerType === "EXTERNAL" ? "TASHQI" : "—"),
    authors: t.contributors.map((c) => c.contributor.fullName).join(", "),
    formats: Array.from(new Set(t.products.map((p) => p.format))),
    editions: t._count.editions,
  }));

  const canWrite = user.permissions.includes("titles.write");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sarlavhalar</h1>
        {canWrite && (
          <Button render={<Link href="/titles/new" />}>
            <Plus className="size-4" /> Yangi asar
          </Button>
        )}
      </div>
      <TitlesTable rows={rows} />
    </div>
  );
}
