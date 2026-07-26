import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { listLeadsByStatus } from "@/lib/services/leads-service";
import { Button } from "@/components/ui/button";
import { LeadsBoard, type LeadCard, type LeadRefs } from "./leads-board";

export const metadata = { title: "Lidlar" };

export default async function LeadsPage() {
  const user = await requirePermission("leads.read");
  const [columns, titles, channels, entities, warehouses, products] = await Promise.all([
    listLeadsByStatus(),
    prisma.title.findMany({ where: { archivedAt: null }, select: { id: true, workTitle: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.salesChannel.findMany({ where: { archivedAt: null }, select: { id: true, name: true, type: true } }),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
    prisma.warehouse.findMany({ where: { archivedAt: null, type: { not: "AGENT" } }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { archivedAt: null }, select: { id: true, sku: true, titleId: true, title: { select: { workTitle: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);

  const cast = (arr: Awaited<ReturnType<typeof listLeadsByStatus>>["NEW"]): LeadCard[] =>
    arr.map((l) => ({
      id: l.id,
      source: l.source,
      campaign: l.campaign,
      contact: l.contact,
      status: l.status,
      interestTitle: l.interestTitle,
      interestTitleId: l.interestTitleId,
      assignee: l.assignee,
      lostReason: l.lostReason,
      convertedOrderId: l.convertedOrderId,
      noteCount: l.noteCount,
      staleness: l.staleness,
    }));

  const refs: LeadRefs = {
    titles,
    channels,
    entities,
    warehouses,
    products: products.map((p) => ({ id: p.id, sku: p.sku, titleId: p.titleId, workTitle: p.title.workTitle })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Lidlar</h1>
        <Button variant="outline" render={<Link href="/leads/analytics" />}>
          <BarChart3 className="size-4" /> Kampaniya analitikasi
        </Button>
      </div>
      <LeadsBoard
        columns={{ NEW: cast(columns.NEW), CONTACTED: cast(columns.CONTACTED), ORDERED: cast(columns.ORDERED), LOST: cast(columns.LOST) }}
        refs={refs}
        canWrite={user.permissions.includes("leads.write")}
      />
    </div>
  );
}
