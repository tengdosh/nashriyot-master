import Link from "next/link";
import { Crown } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { listContracts } from "@/lib/services/contract-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { ContractsClient, type ContractRow, type ContractRefs } from "./contracts-client";

export const metadata = { title: "Shartnomalar" };

export default async function ContractsPage() {
  const user = await requirePermission("royalty.read");

  const [rows, contributors, titles] = await Promise.all([
    listContracts(),
    prisma.contributor.findMany({
      where: { archivedAt: null },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.title.findMany({
      where: { archivedAt: null },
      select: { id: true, workTitle: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  const view: ContractRow[] = rows.map(({ contract: c, advanceOutstanding, tierProblems }) => ({
    id: c.id,
    contributor: c.contributor.fullName,
    contributorRole: c.contributor.role,
    workTitle: c.title?.workTitle ?? "—",
    titleId: c.titleId,
    type: c.type,
    status: c.status,
    advanceAmount: Number(c.advanceAmount),
    advanceOutstanding: advanceOutstanding.toNumber(),
    reserveRate: Number(c.reserveRate),
    buyoutAmount: c.buyoutAmount != null ? Number(c.buyoutAmount) : null,
    audioRights: c.audioRights,
    statementCount: c.statements.length,
    totalPaid: c.statements.reduce((a, s) => a + Number(s.payable), 0),
    tierProblems,
    tiers: c.tiers.map((t) => ({
      id: t.id,
      format: t.format,
      fromUnits: t.fromUnits,
      toUnits: t.toUnits,
      rate: Number(t.rate),
      basis: t.basis,
    })),
  }));

  const royalty = view.filter((c) => c.type === "ROYALTY");
  const buyout = view.filter((c) => c.type === "BUYOUT");
  const refs: ContractRefs = { contributors, titles };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Shartnomalar</h1>
        <Button variant="outline" render={<Link href="/royalties/runs" />}>
          <Crown className="size-4" /> Royalti hisoblari
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="ROYALTY shartnoma" value={royalty.length} hint="Dvigatel shu shartnomalarni hisoblaydi" />
        <KpiCard
          title="BUYOUT shartnoma"
          value={buyout.length}
          hint={
            <span className="inline-flex items-center gap-1">
              dvigatelsiz
              <InfoHint>
                Bir martalik toʻlov TITLE darajasidagi MUALLIF_BUYOUT xarajatiga yoziladi — M3 dagi unikal
                yuk shu yerdan oladi. Nusxadan royalti olinmaydi, aks holda ikki marta sanaladi.
              </InfoHint>
            </span>
          }
        />
        <KpiCard
          title="Qoplanmagan avans"
          value={formatUZS(view.reduce((a, c) => a + c.advanceOutstanding, 0))}
          hint="Kelgusi hisobotlardan ushlanadi"
        />
        <KpiCard
          title="Mualliflarga toʻlangan"
          value={formatUZS(view.reduce((a, c) => a + c.totalPaid, 0))}
          hint="Barcha hisobot satrlari boʻyicha"
        />
      </div>

      <ContractsClient
        rows={view}
        refs={refs}
        canWrite={user.permissions.includes("royalty.write")}
      />
    </div>
  );
}
