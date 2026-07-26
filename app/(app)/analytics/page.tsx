import { requirePermission } from "@/lib/rbac";
import {
  pnlByEntity,
  channelProfitability,
  topTitles,
  slowestTitles,
  deadStockDynamics,
  listSavedReports,
} from "@/lib/services/analytics-service";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { AnalyticsConstructor, type SavedReportView } from "./constructor";
import { PnlTable, type PnlView } from "./pnl-table";
import { PrebuiltReports, type PrebuiltData } from "./prebuilt";
import { RefreshViewsButton } from "./refresh-button";

export const metadata = { title: "Analitika" };

/** Default P&L window: the current calendar year. */
function yearWindow() {
  const y = new Date().getUTCFullYear();
  return { from: `${y}-01`, to: `${y}-12` };
}

export default async function AnalyticsPage() {
  const user = await requirePermission("analytics.read");
  const { from, to } = yearWindow();

  const [pnl, channels, top, slowest, dead, saved] = await Promise.all([
    pnlByEntity(from, to),
    channelProfitability(),
    topTitles(10),
    slowestTitles(10),
    deadStockDynamics(),
    listSavedReports(),
  ]);

  const pnlView: PnlView = {
    rows: pnl.rows.map(serializePnl),
    total: serializePnl(pnl.total),
  };

  const prebuilt: PrebuiltData = {
    top: top.map((t) => ({ label: t.item.work_title, value: t.value.toNumber() })),
    slowest: slowest.map((t) => ({ label: t.item.work_title, value: t.value.toNumber() })),
    channels: channels.map((c) => ({
      channel: c.channel,
      netRevenue: c.netRevenue.toNumber(),
      cm: c.cm.toNumber(),
      cmRate: c.cmRate.toNumber(),
      units: c.units,
    })),
    deadStock: {
      total: dead.total.toNumber(),
      count: dead.count,
      rows: dead.rows.map((r) => ({
        workTitle: r.workTitle,
        sku: r.sku,
        qtyOnHand: r.qtyOnHand,
        ageDays: r.ageDays,
        totalLoss: r.totalLoss.toNumber(),
      })),
    },
  };

  const savedView: SavedReportView[] = saved.map((s) => ({
    id: s.id,
    name: s.name,
    spec: s.spec as SavedReportView["spec"],
    createdBy: s.createdBy?.fullName ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analitika</h1>
          <p className="text-sm text-muted-foreground">
            Barcha raqamlar materiallashtirilgan koʻrinishlardan — muhrlangan sotuv va royalti asosida.
          </p>
        </div>
        {user.permissions.includes("admin.settings") && <RefreshViewsButton />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Yillik sof tushum" value={formatUZS(pnl.total.revenue.toNumber())} hint={`${from} – ${to}`} />
        <KpiCard
          title="Yalpi foyda"
          value={formatUZS(pnl.total.grossProfit.toNumber())}
          hint={`${(pnl.total.grossMargin.toNumber() * 100).toFixed(1)}% marja`}
        />
        <KpiCard
          title="Sof foyda"
          value={formatUZS(pnl.total.netProfit.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              {(pnl.total.netMargin.toNumber() * 100).toFixed(1)}% marja
              <InfoHint>Sof foyda = yalpi foyda − royalti − doimiy xarajatlar.</InfoHint>
            </span>
          }
        />
        <KpiCard title="Muzlagan kapital" value={formatUZS(prebuilt.deadStock.total)} hint={`${prebuilt.deadStock.count} oʻlik SKU`} />
      </div>

      <PnlTable pnl={pnlView} window={`${from} – ${to}`} />

      <AnalyticsConstructor saved={savedView} canSave={user.permissions.includes("analytics.read")} />

      <PrebuiltReports data={prebuilt} />
    </div>
  );
}

function serializePnl(r: Awaited<ReturnType<typeof pnlByEntity>>["total"]) {
  return {
    entityId: r.entityId,
    entityName: r.entityName,
    revenue: r.revenue.toNumber(),
    cogs: r.cogs.toNumber(),
    grossProfit: r.grossProfit.toNumber(),
    royalty: r.royalty.toNumber(),
    fixedCosts: r.fixedCosts.toNumber(),
    netProfit: r.netProfit.toNumber(),
    grossMargin: r.grossMargin.toNumber(),
    netMargin: r.netMargin.toNumber(),
  };
}
