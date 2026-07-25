import Link from "next/link";
import { FileSignature } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { listRoyaltyRuns } from "@/lib/services/royalty-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { RunsClient, type RunRow } from "./runs-client";

export const metadata = { title: "Royalti hisoblari" };

export default async function RoyaltyRunsPage() {
  const user = await requirePermission("royalty.read");
  const runs = await listRoyaltyRuns();

  const rows: RunRow[] = runs.map((r) => ({
    id: r.id,
    period: r.period,
    status: r.status,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    sealed: r.sealedAt != null,
    createdBy: r.createdBy?.fullName ?? null,
    approvedBy: r.approvedBy?.fullName ?? null,
    statements: r.statements.length,
    authors: new Set(r.statements.map((s) => s.contract.contributorId)).size,
    earned: r.statements.reduce((a, s) => a + Number(s.earned), 0),
    payable: r.statements.reduce((a, s) => a + Number(s.payable), 0),
    reserveHeld: r.statements.reduce((a, s) => a + Number(s.reserveHeld), 0),
    advanceRecouped: r.statements.reduce((a, s) => a + Number(s.advanceRecouped), 0),
  }));

  const sent = rows.filter((r) => r.status === "SENT");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Royalti hisoblari</h1>
          <p className="text-sm text-muted-foreground">
            Dvigatel faqat YOPILGAN davrning muhrlangan sotuvini oʻqiydi. Tasdiqlangan davr muhrlanadi —
            qayta hisoblash ham, kechikkan tahrir ham taqiqlanadi.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/contracts" />}>
          <FileSignature className="size-4" /> Shartnomalar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Hisoblar" value={rows.length} hint={`${sent.length} yuborilgan`} />
        <KpiCard
          title="Jami hisoblangan"
          value={formatUZS(rows.reduce((a, r) => a + r.earned, 0))}
          hint={
            <span className="inline-flex items-center gap-1">
              kumulyativ tier boʻyicha
              <InfoHint>
                Tierlar shartnoma umri boʻyicha kumulyativ — davr nusxalari umrbod oʻqqa joylashadi va bir
                nechta tierni qamrab olishi mumkin.
              </InfoHint>
            </span>
          }
        />
        <KpiCard
          title="Ushlangan zaxira"
          value={formatUZS(rows.reduce((a, r) => a + r.reserveHeld, 0))}
          hint="Kelgusi davrda ochiladi, qaytishlar shundan qoplanadi"
        />
        <KpiCard
          title="Toʻlanadigan"
          value={formatUZS(rows.reduce((a, r) => a + r.payable, 0))}
          hint={`Avansdan qoplangan: ${formatUZS(rows.reduce((a, r) => a + r.advanceRecouped, 0))}`}
        />
      </div>

      <RunsClient
        rows={rows}
        canWrite={user.permissions.includes("royalty.write")}
      />
    </div>
  );
}
