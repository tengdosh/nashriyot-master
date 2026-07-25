import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { listReturns, netSalesByProduct } from "@/lib/services/returns-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatNumber, formatUZS } from "@/lib/format";
import { ReturnsTable, type ReturnRow } from "./returns-client";

export const metadata = { title: "Qaytishlar" };

export default async function ReturnsPage() {
  await requirePermission("sales.read");

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const [returns, period] = await Promise.all([listReturns(), netSalesByProduct(from, now)]);

  const rows: ReturnRow[] = returns.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    qty: r.qty,
    condition: r.condition,
    workTitle: r.orderLine.product.title.workTitle,
    sku: r.orderLine.product.sku,
    orderId: r.orderLine.order.id,
    who: r.orderLine.order.partner?.name ?? r.orderLine.order.customerName ?? "Mijoz",
    orderStatus: r.orderLine.order.status,
    netUnit:
      Number(r.orderLine.unitPrice) * (1 - Number(r.orderLine.discountRate)),
  }));

  const periodUnits = period.reduce((a, p) => a + p.units, 0);
  const periodReturned = period.reduce((a, p) => a + p.returnedUnits, 0);
  const periodRevenue = period.reduce((a, p) => a + p.revenue.toNumber(), 0);
  const returnRate = periodUnits > 0 ? periodReturned / periodUnits : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Qaytishlar</h1>
        <Button variant="outline" render={<Link href="/sales/orders" />}>
          <ArrowLeft className="size-4" /> Buyurtmalarga
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Bu oy joʻnatilgan" value={formatNumber(periodUnits)} hint="Muhrlangan qatorlar" />
        <KpiCard title="Bu oy qaytgan" value={formatNumber(periodReturned)} hint="Sotiladigan + shikastlangan" />
        <KpiCard
          title="Qaytish ulushi"
          value={`${(returnRate * 100).toFixed(1)}%`}
          hint="Qaytgan ÷ joʻnatilgan"
        />
        <KpiCard
          title="Davr sof sotuvi"
          value={formatUZS(periodRevenue)}
          hint={
            <span className="inline-flex items-center gap-1">
              qaytishlar chegirilgan
              <InfoHint>
                Sof sotuv = (joʻnatilgan − qaytgan) × muhrlangan sof birlik narx. Royalti dvigateli va kanal
                KPI ayni shu raqamni oʻqiydi.
              </InfoHint>
            </span>
          }
        />
      </div>

      <ReturnsTable rows={rows} />
    </div>
  );
}
