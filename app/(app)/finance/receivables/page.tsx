import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { agingReport } from "@/lib/services/receivables-service";
import { creditPanel } from "@/lib/services/finance-service";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReceivablesClient, type ReceivableView } from "../../sales/receivables/receivables-client";

export const metadata = { title: "Qarzlar (AR)" };

export default async function FinanceReceivablesPage() {
  const user = await requirePermission("finance.read");
  const [{ rows, summary }, credit] = await Promise.all([agingReport(), creditPanel()]);

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
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft className="size-4" /> Moliya markazi
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="Jami qarz" value={formatUZS(summary.total.toNumber())} hint="ochiq va qisman toʻlangan" />
        <KpiCard title="Muddati oʻtgan" value={formatUZS(summary.overdue.toNumber())} hint="Jami − muddati kelmagan" />
        <KpiCard title="90+ kun" value={formatUZS(summary.buckets.D90_PLUS.toNumber())} hint="Eng xatarli guruh" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{AGING_LABELS[b]}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatUZS(summary.buckets[b].toNumber())}</div>
          </div>
        ))}
      </div>

      <ReceivablesClient
        rows={view}
        canPay={user.permissions.includes("finance.write")}
        canAdmin={user.permissions.includes("admin.settings")}
      />

      {/* Credit-limit panel */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
          <ShieldAlert className="size-4 text-muted-foreground" /> Kredit limitlari
          <InfoHint>Mavjud = kredit limiti − joriy qarz qoldigʻi. Manfiy boʻlsa limit oshib ketgan.</InfoHint>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hamkor</TableHead>
                <TableHead className="text-right">Kredit limiti</TableHead>
                <TableHead className="text-right">Joriy qarz</TableHead>
                <TableHead className="text-right">Mavjud</TableHead>
                <TableHead>Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credit.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Maʼlumot yoʻq</TableCell></TableRow>
              )}
              {credit.map((c) => (
                <TableRow key={c.partnerId}>
                  <TableCell className="font-medium">{c.partnerName}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.creditLimit != null ? formatUZS(c.creditLimit.toNumber()) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUZS(c.outstanding.toNumber())}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", c.overLimit && "font-medium text-destructive")}>
                    {c.available != null ? formatUZS(c.available.toNumber()) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.isBlocked ? (
                      <StatusBadge status="BLOCKED" tone="danger" label="Bloklangan" />
                    ) : c.overLimit ? (
                      <StatusBadge status="OVER" tone="warning" label="Limit oshgan" />
                    ) : (
                      <StatusBadge status="OK" tone="success" label="Normal" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
