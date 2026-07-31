import Link from "next/link";
import { Receipt, CreditCard, GitCompareArrows, Users, ArrowRightLeft } from "lucide-react";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { financeOverview } from "@/lib/services/finance-service";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Moliya markazi" };

const SUBPAGES = [
  { href: "/finance/receivables", label: "Qarzlar (AR)", icon: Receipt },
  { href: "/finance/payables", label: "Majburiyatlar (AP)", icon: CreditCard },
  { href: "/finance/reconciliation", label: "Bank solishtiruvi", icon: GitCompareArrows },
  { href: "/finance/agents", label: "Agent KPI", icon: Users },
];

export default async function FinancePage() {
  const user = await requirePermission("finance.read");
  const eIds = entityFilter(user);
  const o = await financeOverview(new Date(), eIds);

  const maxFlow = Math.max(
    1,
    ...o.weekly.map((w) => Math.max(w.in.toNumber(), w.out.toNumber())),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Moliya markazi</h1>
        <div className="flex flex-wrap gap-2">
          {SUBPAGES.map((s) => (
            <Button key={s.href} variant="outline" size="sm" render={<Link href={s.href} />}>
              <s.icon className="size-4" /> {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Kassa qoldigʻi"
          value={formatUZS(o.cashTotal.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              barcha sub&apos;ektlar
              <InfoHint>Kassa = Σ kirim toʻlovlar − Σ chiqim toʻlovlar (sub&apos;ekt kesimida).</InfoHint>
            </span>
          }
        />
        <KpiCard title="Debitorlik (AR)" value={formatUZS(o.arTotal.toNumber())} hint="Ochiq mijoz qarzlari" />
        <KpiCard title="Kreditorlik (AP)" value={formatUZS(o.apTotal.toNumber())} hint="Toʻlanmagan majburiyatlar" />
        <KpiCard
          title="Ichki hisob-kitob"
          value={formatUZS(o.ledgerTotal.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              sub&apos;ektlararo qoldiq
              <InfoHint>Transferlardan kelib chiqqan, hali yopilmagan ichki qarzlar yigʻindisi.</InfoHint>
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ArrowRightLeft className="size-4 text-muted-foreground" /> Kassa — sub&apos;ekt kesimida
          </div>
          <div className="flex flex-col divide-y">
            {o.cashByEntity.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Toʻlov maʼlumoti yoʻq</p>
            )}
            {o.cashByEntity.map((c) => (
              <div key={c.entityId} className="flex items-center justify-between py-2 text-sm">
                <span>{c.entityName}</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    c.balance.lt(0) && "text-destructive",
                  )}
                >
                  {formatUZS(c.balance.toNumber())}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            Haftalik pul oqimi
            <InfoHint>Soʻnggi 12 ISO hafta: kirim (yashil) va chiqim (qizil) toʻlovlar.</InfoHint>
          </div>
          {o.weekly.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Maʼlumot yoʻq</p>
          ) : (
            <div className="flex flex-col gap-2">
              {o.weekly.map((w) => (
                <div key={w.week} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{w.week}</span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="h-2 rounded-full bg-success/70" style={{ width: `${(w.in.toNumber() / maxFlow) * 100}%` }} />
                    <div className="h-2 rounded-full bg-destructive/60" style={{ width: `${(w.out.toNumber() / maxFlow) * 100}%` }} />
                  </div>
                  <span
                    className={cn("w-28 shrink-0 text-right tabular-nums", w.net.lt(0) ? "text-destructive" : "text-success")}
                  >
                    {formatUZS(w.net.toNumber())}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
