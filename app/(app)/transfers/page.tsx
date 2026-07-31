import Link from "next/link";
import { Scale } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { listTransfers } from "@/lib/services/transfer-service";
import { Button } from "@/components/ui/button";
import { TransfersClient, type TransferRow, type TransferRefs } from "./transfers-client";

export const metadata = { title: "Transferlar" };

export default async function TransfersPage() {
  const user = await requirePermission("transfers.read");

  const [transfers, entities, warehouses, products] = await Promise.all([
    listTransfers(200, user.entityAccess ?? []),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
    prisma.warehouse.findMany({ where: { archivedAt: null, type: { not: "AGENT" } }, select: { id: true, name: true, entityId: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { archivedAt: null },
      select: { id: true, sku: true, listPrice: true, titleId: true, title: { select: { workTitle: true, entityId: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  const rows: TransferRow[] = transfers.map((t) => ({
    id: t.id,
    from: t.fromEntity.name,
    to: t.toEntity.name,
    status: t.status,
    date: t.date.toISOString(),
    units: t.lines.reduce((a, l) => a + l.qty, 0),
    total: t.lines.reduce((a, l) => a + Number(l.transferPrice) * l.qty, 0),
    lines: t.lines.map((l) => ({
      workTitle: l.product.title.workTitle,
      sku: l.product.sku,
      qty: l.qty,
      basePrice: Number(l.basePrice),
      discountRate: Number(l.discountRate),
      transferPrice: Number(l.transferPrice),
    })),
  }));

  const refs: TransferRefs = {
    entities,
    warehouses,
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      titleId: p.titleId,
      workTitle: p.title.workTitle,
      listPrice: Number(p.listPrice),
      entityId: p.title.entityId,
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sub&apos;ektlararo transferlar</h1>
        <Button variant="outline" render={<Link href="/entities/ledger" />}>
          <Scale className="size-4" /> Ichki ledger
        </Button>
      </div>
      <TransfersClient
        rows={rows}
        refs={refs}
        canWrite={user.permissions.includes("transfers.write")}
        canOverride={user.permissions.includes("transfers.override")}
      />
    </div>
  );
}
