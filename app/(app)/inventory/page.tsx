import Link from "next/link";
import { ArrowLeftRight, Skull, BarChart3 } from "lucide-react";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { inventoryOverview } from "@/lib/services/reorder-service";
import { fourState } from "@/lib/services/inventory-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { formatUZS } from "@/lib/format";
import { InventoryTable, type SkuRowView } from "./inventory-table";

export const metadata = { title: "Ombor" };

export default async function InventoryPage() {
  const user = await requirePermission("inventory.read");
  const eIds = entityFilter(user);

  const [overview, warehouses] = await Promise.all([
    inventoryOverview(new Date(), eIds),
    prisma.warehouse.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: SkuRowView[] = await Promise.all(
    overview.map(async (o) => {
      const st = await fourState(o.product.id);
      return {
        productId: o.product.id,
        sku: o.product.sku,
        workTitle: o.product.title.workTitle,
        format: o.product.format,
        abcClass: o.product.abcClass,
        qtyOnHand: o.qtyOnHand,
        qtyReserved: o.qtyReserved,
        available: o.available,
        onOrder: o.onOrder,
        unitCost: o.unitCost.toNumber(),
        rop: Math.round(o.rop.rop.toNumber()),
        ss: Math.round(o.rop.ss.toNumber()),
        suggestQty: o.rop.suggestQty,
        isManualRop: o.rop.isManual,
        status: o.status,
        omborda: st.omborda,
        agentda: st.agentda,
        sotilgan: st.sotilgan,
        qaytgan: st.qaytgan,
        warehouses: o.byWarehouse.map((i) => ({
          id: i.warehouse.id,
          name: i.warehouse.name,
          type: i.warehouse.type,
          qtyOnHand: i.qtyOnHand,
        })),
      };
    }),
  );

  const stockValue = rows.reduce((a, r) => a + r.qtyOnHand * r.unitCost, 0);
  const atAgents = rows.reduce((a, r) => a + r.agentda, 0);
  const belowRop = rows.filter((r) => r.status === "BELOW_ROP").length;
  const dead = rows.filter((r) => r.status === "DEAD").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ombor</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/inventory/movements" />}>
            <ArrowLeftRight className="size-4" /> Harakatlar
          </Button>
          <Button variant="outline" render={<Link href="/inventory/abc" />}>
            <BarChart3 className="size-4" /> ABC
          </Button>
          <Button variant="outline" render={<Link href="/inventory/dead-stock" />}>
            <Skull className="size-4" /> Oʻlik zaxira
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Zaxira qiymati"
          value={formatUZS(stockValue)}
          hint="Σ qoldiq × FIFO oʻrtacha birlik narx (faqat bosma qatlami)"
        />
        <KpiCard title="Agentlarda (konsignatsiya)" value={atAgents.toLocaleString("ru-RU")} hint="AGENT omborlaridagi nusxalar" />
        <KpiCard title="ROP dan past" value={belowRop} hint="Qayta buyurtma nuqtasidan past SKU" />
        <KpiCard title="Oʻlik zaxira SKU" value={dead} hint="Skaner belgilagan, tasarruf kutayotgan" />
      </div>

      <InventoryTable
        rows={rows}
        warehouses={warehouses}
        canWrite={user.permissions.includes("inventory.write")}
        canAdjust={user.permissions.includes("inventory.adjust")}
      />
    </div>
  );
}
