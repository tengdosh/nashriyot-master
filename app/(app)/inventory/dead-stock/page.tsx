// check:entity-ok: primary model has no entityId — this module is company-wide
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { deadStockReport } from "@/lib/services/dead-stock-service";
import { getInventorySettings } from "@/lib/services/inventory-settings";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { DeadStockClient, type DeadStockRow, type WriteDownRow } from "./dead-stock-client";

export const metadata = { title: "Oʻlik zaxira" };

export default async function DeadStockPage() {
  const user = await requirePermission("inventory.read");

  const [{ flags, totals }, cfg, warehouses, writeDowns] = await Promise.all([
    deadStockReport(),
    getInventorySettings(),
    prisma.warehouse.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.writeDown.findMany({
      where: { status: { in: ["PENDING_APPROVAL", "APPROVED", "REJECTED"] } },
      include: {
        product: { select: { sku: true, title: { select: { workTitle: true } } } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const rows: DeadStockRow[] = flags.map((f) => ({
    productId: f.productId,
    workTitle: f.product.title.workTitle,
    sku: f.product.sku,
    format: f.product.format,
    listPrice: Number(f.product.listPrice),
    ageDays: f.ageDays,
    qtyOnHand: f.qtyOnHand,
    unitCost: Number(f.unitCost),
    deadCost: Number(f.deadCost),
    carryingCost: Number(f.carryingCost),
    opportunityCost: Number(f.opportunityCost),
    totalLoss: Number(f.totalLoss),
    carryingRate: Number(f.carryingRate),
    expectedROI: Number(f.expectedROI),
    thresholdDays: f.thresholdDays,
    status: f.status,
    suggestedAction: f.suggestedAction,
    suggestedDiscount: f.suggestedDiscount ? Number(f.suggestedDiscount) : 0,
    scannedAt: f.scannedAt.toISOString(),
  }));

  const wdRows: WriteDownRow[] = writeDowns.map((w) => ({
    id: w.id,
    workTitle: w.product.title.workTitle,
    sku: w.product.sku,
    qty: w.qty,
    amountUZS: Number(w.amountUZS),
    action: w.action,
    reason: w.reason,
    status: w.status,
    createdBy: w.createdBy.fullName,
    createdById: w.createdById,
    approvedBy: w.approvedBy?.fullName ?? null,
    createdAt: w.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Oʻlik zaxira</h1>
        <Button variant="outline" render={<Link href="/inventory" />}>
          <ArrowLeft className="size-4" /> Omborga
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Muzlagan kapital"
          value={formatUZS(totals.total.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              C_dead + C_carrying + C_opportunity
              <InfoHint>
                C_dead = qoldiq × birlik narx · C_carrying = C_dead × saqlash% · C_opportunity = C_dead ×
                kutilgan ROI. Har bir bayroqda sozlama muhrlangan, keyin stavkani oʻzgartirish eski
                raqamlarni qayta yozmaydi.
              </InfoHint>
            </span>
          }
        />
        <KpiCard title="C_dead" value={formatUZS(totals.dead.toNumber())} hint="Zaxiraga qotib qolgan pul" />
        <KpiCard
          title="C_carrying"
          value={formatUZS(totals.carrying.toNumber())}
          hint={`Saqlash xarajati (${(cfg.carryingRate * 100).toFixed(0)}%)`}
        />
        <KpiCard
          title="C_opportunity"
          value={formatUZS(totals.opportunity.toNumber())}
          hint={`Boy berilgan daromad (ROI ${(cfg.expectedROI * 100).toFixed(0)}%)`}
        />
      </div>

      <DeadStockClient
        rows={rows}
        writeDowns={wdRows}
        warehouses={warehouses}
        settings={{
          deadStockDays: cfg.deadStockDays,
          carryingRate: cfg.carryingRate,
          expectedROI: cfg.expectedROI,
          minTurnover: cfg.minTurnover,
        }}
        copies={totals.copies}
        currentUserId={user.id!}
        canWrite={user.permissions.includes("inventory.write")}
        canAdjust={user.permissions.includes("inventory.adjust")}
        canAdmin={user.permissions.includes("admin.settings")}
      />
    </div>
  );
}
