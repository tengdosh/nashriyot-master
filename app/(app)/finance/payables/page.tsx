import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { payablesReport } from "@/lib/services/finance-service";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { formatUZS } from "@/lib/format";
import { PayablesClient, type PayableView, type PartnerOption, type EntityOption } from "./payables-client";

export const metadata = { title: "Majburiyatlar (AP)" };

export default async function PayablesPage() {
  const user = await requirePermission("finance.read");
  const [{ rows, summary }, partners, entities] = await Promise.all([
    payablesReport(),
    prisma.partner.findMany({
      where: { archivedAt: null, roles: { hasSome: ["PRINTER", "SUPPLIER", "EXT_PUBLISHER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const view: PayableView[] = rows.map((r) => ({
    id: r.id,
    partnerName: r.partnerName,
    type: r.type,
    currency: r.currency,
    amount: r.amount.toNumber(),
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
        <h1 className="text-2xl font-semibold tracking-tight">Majburiyatlar (AP)</h1>
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft className="size-4" /> Moliya markazi
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="Jami majburiyat" value={formatUZS(summary.total.toNumber())} hint="ochiq va qisman toʻlangan" />
        <KpiCard title="Muddati oʻtgan" value={formatUZS(summary.overdue.toNumber())} hint="Jami − muddati kelmagan" />
        <KpiCard title="90+ kun" value={formatUZS(summary.buckets.D90_PLUS.toNumber())} hint="Eng kechikkan toʻlovlar" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{AGING_LABELS[b]}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatUZS(summary.buckets[b].toNumber())}</div>
          </div>
        ))}
      </div>

      <PayablesClient
        rows={view}
        partners={partners as PartnerOption[]}
        entities={entities as EntityOption[]}
        canWrite={user.permissions.includes("finance.write")}
      />
    </div>
  );
}
