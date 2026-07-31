import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { MovementsTable, type MovementRow } from "./movements-client";

export const metadata = { title: "Ombor harakatlari" };

export default async function MovementsPage() {
  const user = await requirePermission("inventory.read");
  const eIds = entityFilter(user);
  const entityWhere = eIds !== null ? { warehouse: { entityId: { in: eIds } } } : {};

  const movements = await prisma.stockMovement.findMany({
    where: entityWhere,
    include: {
      product: { select: { sku: true, title: { select: { workTitle: true } } } },
      warehouse: { select: { name: true, type: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  const rows: MovementRow[] = movements.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    type: m.type,
    workTitle: m.product.title.workTitle,
    sku: m.product.sku,
    warehouse: m.warehouse.name,
    warehouseType: m.warehouse.type,
    qty: m.qty,
    unitCost: m.unitCost ? Number(m.unitCost) : null,
    qtyRemaining: m.qtyRemaining,
    refType: m.refType,
    reason: m.reason,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Ombor harakatlari</h1>
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="size-4" /> Omborga
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Har bir yozuv oʻzgarmas: KIRIM qatlami (unitCost + qoldiq) FIFO uchun, CHIQIM ogʻirlangan tannarxda,
        TRANSFER/TUZATISH esa sabab bilan. Sotuv faqat CHIQIM.
      </p>
      <MovementsTable rows={rows} />
    </div>
  );
}
