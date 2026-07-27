import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ImportClient } from "./import-client";

export const metadata = { title: "Import" };

export default async function AdminImportPage() {
  await requirePermission("admin.import");

  const [sotuvStats, kirimlarStats] = await Promise.all([
    prisma.$queryRaw<{ count: string; last_date: string | null }[]>`
      SELECT COUNT(o.id)::text AS count,
             MAX(o."shippedDate")::text AS last_date
      FROM "SalesOrder" o
      JOIN "SalesChannel" c ON c.id = o."channelId"
      WHERE c.name LIKE 'Import (%)'
    `,
    prisma.$queryRaw<{ count: string; total_qty: string; last_date: string | null }[]>`
      SELECT COUNT(*)::text AS count,
             SUM(qty)::text AS total_qty,
             MAX(date)::text AS last_date
      FROM "StockMovement"
      WHERE "refType" = 'Import' AND type = 'IN'
    `,
  ]);

  const coverage = {
    sotuvOrders: Number(sotuvStats[0]?.count ?? 0),
    sotuvLastDate: sotuvStats[0]?.last_date ?? null,
    kirimlarLayers: Number(kirimlarStats[0]?.count ?? 0),
    kirimlarTotalQty: Number(kirimlarStats[0]?.total_qty ?? 0),
    kirimlarLastDate: kirimlarStats[0]?.last_date ?? null,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Import (CSV)</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <ImportClient coverage={coverage} />
    </div>
  );
}
