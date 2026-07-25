import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { portalOverview } from "@/lib/services/portal-service";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatNumber, formatUZS } from "@/lib/format";
import { EarningsChart } from "./earnings-chart";

export const metadata = { title: "Muallif portali" };

export default async function PortalHomePage() {
  const session = await auth();
  const contributorId = session?.user?.contributorId;
  if (!contributorId) redirect("/login?error=no-contributor");

  const o = await portalOverview(contributorId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Umumiy</h1>
        <p className="text-sm text-muted-foreground">
          Bu yerdagi barcha raqamlar faqat YUBORILGAN davrlarga tegishli — tayyorlanayotgan hisobotlar
          koʻrsatilmaydi.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Jami sof nusxa" value={formatNumber(o.totalNetUnits)} hint={`${o.periods} yuborilgan davr`} />
        <KpiCard
          title="Jami hisoblangan"
          value={formatUZS(o.totalEarned.toNumber())}
          hint={
            <span className="inline-flex items-center gap-1">
              royalti
              <InfoHint>Tier jadvali boʻyicha hisoblangan royalti — zaxira va avansdan oldingi summa.</InfoHint>
            </span>
          }
        />
        <KpiCard title="Toʻlangan" value={formatUZS(o.totalPaid.toNumber())} hint="Zaxira va avans chegirilgan" />
        <KpiCard
          title="Ushlangan zaxira"
          value={formatUZS(o.reserveHeld.toNumber())}
          hint="Qaytishlarga qarshi, keyingi davrda ochiladi"
        />
      </div>

      {o.advanceAmount.gt(0) && (
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm font-medium">
              Avans qoplash
              <InfoHint>
                Avans kelgusi royaltidan bosqichma-bosqich qoplanadi. Toʻliq qoplangach, toʻlovlar toʻgʻridan
                toʻgʻri sizga oʻtadi.
              </InfoHint>
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatUZS(o.advanceRecouped.toNumber())} / {formatUZS(o.advanceAmount.toNumber())}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(o.advanceProgress * 100, 100).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Qolgan avans: {formatUZS(o.advanceOutstanding.toNumber())}
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-medium">Oylik royalti (yuborilgan davrlar)</h2>
        {o.monthly.length > 0 ? (
          <EarningsChart data={o.monthly} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Hali yuborilgan hisobot yoʻq. Davr hisobi tasdiqlanib yuborilgach, bu yerda paydo boʻladi.
          </p>
        )}
      </div>
    </div>
  );
}
