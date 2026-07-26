import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, Info, TriangleAlert } from "lucide-react";
import {
  kpiSummary,
  monthlyRevenue,
  alerts,
  channelDonut,
  dashboardTopTitles,
  overdueTasks,
  arMini,
} from "@/lib/services/dashboard-service";
import { AGING_LABELS, type AgingBucket } from "@/lib/sales";
import { KpiCard } from "@/components/shared/kpi-card";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";
import { RevenueChart } from "./revenue-chart";
import { cn } from "@/lib/utils";
import type { WidgetId } from "@/lib/dashboard";

/**
 * Wrap a widget's async render so a data-fetch failure degrades to an inline
 * message instead of taking the whole board down. Each widget is otherwise fully
 * independent (spec v1 §5.9).
 */
async function guard(render: () => Promise<React.ReactNode>): Promise<React.ReactNode> {
  try {
    return await render();
  } catch {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <TriangleAlert className="size-4" /> Vidjet maʼlumotini yuklab boʻlmadi
      </div>
    );
  }
}

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {href && (
          <Link href={href} className="text-muted-foreground hover:text-foreground" aria-label="Batafsil">
            <ArrowRight className="size-4" />
          </Link>
        )}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "text-destructive",
  WARNING: "text-warning",
  INFO: "text-muted-foreground",
};
const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Render a widget by id. Each self-guards its own data fetch. */
export function renderWidget(id: WidgetId, ctx: { roles: string[] }): Promise<React.ReactNode> {
  switch (id) {
    case "kpi":
      return guard(async () => {
        const k = await kpiSummary();
        return (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Yillik sof tushum" value={formatUZS(k.netRevenue.toNumber())} hint="mv_monthly_sales (joriy yil)" />
            <KpiCard title="Marja (CM)" value={formatUZS(k.cm.toNumber())} hint={`${(k.cmRate.toNumber() * 100).toFixed(1)}% sofdan`} />
            <KpiCard title="Tannarx" value={formatUZS(k.cogs.toNumber())} hint="FIFO, muhrlangan" />
            <KpiCard title="Sotilgan nusxa" value={formatNumber(k.units)} hint="Joriy yil" />
          </div>
        );
      });

    case "monthly-revenue":
      return guard(async () => <RevenueChart data={await monthlyRevenue()} />);

    case "alerts":
      return guard(async () => {
        const items = await alerts(ctx.roles);
        return (
          <Panel title="Ogohlantirishlar">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Yangi ogohlantirish yoʻq</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {items.map((n) => {
                  const Icon = n.severity === "INFO" ? Info : AlertTriangle;
                  const body = (
                    <span className="flex items-start gap-2 py-2">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_TONE[n.severity])} />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">{n.title}</span>
                        {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                      </span>
                    </span>
                  );
                  return (
                    <li key={n.id}>
                      {n.linkUrl ? (
                        <Link href={n.linkUrl} className="block hover:bg-muted/50">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );
      });

    case "top-titles":
      return guard(async () => {
        const rows = await dashboardTopTitles();
        const max = Math.max(...rows.map((r) => r.value.toNumber()), 1);
        return (
          <Panel title="Top-10 asar" href="/analytics">
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Maʼlumot yoʻq</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {rows.map((r, i) => (
                  <li key={`${r.workTitle}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-24 flex-1 truncate">{r.workTitle}</span>
                    <span className="inline-block h-2 rounded-sm bg-primary/50" style={{ width: `${(r.value.toNumber() / max) * 80}px` }} />
                    <span className="w-28 text-right tabular-nums">{formatUZS(r.value.toNumber())}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        );
      });

    case "channel-donut":
      return guard(async () => {
        const d = await channelDonut();
        let acc = 0;
        const stops = d.slices
          .map((s, i) => {
            const from = acc * 100;
            acc += s.share;
            return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}% ${acc * 100}%`;
          })
          .join(", ");
        return (
          <Panel title="Kanal ulushi" href="/sales/channels">
            {d.slices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Maʼlumot yoʻq</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative size-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }} aria-hidden>
                  <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
                </div>
                <ul className="flex flex-1 flex-col gap-1 text-sm">
                  {d.slices.map((s, i) => (
                    <li key={s.channel} className="flex items-center gap-2">
                      <span className="size-3 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="flex-1 truncate">{s.channel}</span>
                      <span className="tabular-nums text-muted-foreground">{(s.share * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        );
      });

    case "overdue-tasks":
      return guard(async () => {
        const tasks = await overdueTasks();
        return (
          <Panel title="Kechikkan vazifalar" href="/production">
            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Kechikkan vazifa yoʻq</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex flex-col">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.workTitle}
                        {t.assignee && ` · ${t.assignee}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs text-destructive">
                      <Clock className="size-3.5" />
                      {t.daysOverdue} kun · {formatDate(t.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      });

    case "ar-mini":
      return guard(async () => {
        const ar = await arMini();
        const buckets: AgingBucket[] = ["CURRENT", "D0_30", "D31_60", "D61_90", "D90_PLUS"];
        const max = Math.max(...buckets.map((b) => ar.buckets[b].toNumber()), 1);
        return (
          <Panel title="Qarzlar (AR)" href="/sales/receivables">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{formatUZS(ar.total.toNumber())}</span>
              <span className="text-xs text-destructive">muddati oʻtgan {formatUZS(ar.overdue.toNumber())}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {buckets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-muted-foreground">{AGING_LABELS[b]}</span>
                  <span
                    className={cn("inline-block h-2 rounded-sm", b === "D90_PLUS" ? "bg-destructive/70" : "bg-primary/50")}
                    style={{ width: `${(ar.buckets[b].toNumber() / max) * 90}px` }}
                  />
                  <span className="flex-1 text-right tabular-nums">{formatUZS(ar.buckets[b].toNumber())}</span>
                </li>
              ))}
            </ul>
          </Panel>
        );
      });
  }
}
