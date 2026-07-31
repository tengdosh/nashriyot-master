import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { agingReport } from "@/lib/services/receivables-service";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { ReceivablesClient, type ReceivableView } from "./receivables-client";

export const metadata = { title: "Qarzlar (AR)" };

export default async function ReceivablesPage() {
  const user = await requirePermission("sales.read");
  const eIds = entityFilter(user);
  const { rows, summary } = await agingReport(new Date(), eIds);

  const view: ReceivableView[] = rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    who: r.partnerName ?? r.customerName ?? "Mijoz",
    entityName: r.entityName,
    amountUZS: r.amountUZS.toNumber(),
    paidUZS: r.paidUZS.toNumber(),
    outstandingUZS: r.outstandingUZS.toNumber(),
    dueDate: r.dueDate?.toISOString() ?? null,
    daysOverdue: r.daysOverdue,
    bucket: r.bucket,
    status: r.status,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Qarzlar (AR)</h1>
        <Button variant="outline" render={<Link href="/sales/orders" />}>
          <ArrowLeft className="size-4" /> Buyurtmalarga
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Jami qarz"
          value={formatUZS(summary.total.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              ochiq va qisman toʻlangan
              <InfoHint>
                Qoldiq = muhrlangan summa − toʻlangan. Toʻliq yopilgan qarz hisobotdan chiqib ketadi.
              </InfoHint>
            </span>
          }
        />
        <KpiCard
          title="Muddati oʻtgan"
          value={formatUZS(summary.overdue.toNumber())}
          hint="Jami − muddati kelmagan"
        />
        <KpiCard
          title="90+ kun"
          value={formatUZS(summary.buckets.D90_PLUS.toNumber())}
          hint="Eng xatarli guruh — kritik bildirishnoma yuboriladi"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{AGING_LABELS[b]}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatUZS(summary.buckets[b].toNumber())}
            </div>
          </div>
        ))}
      </div>

      <ReceivablesClient
        rows={view}
        canPay={user.permissions.includes("finance.write")}
        canAdmin={user.permissions.includes("admin.settings")}
      />
    </div>
  );
}
