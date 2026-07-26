import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { entityLedger } from "@/lib/services/transfer-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { LedgerClient, type LedgerRow, type EntityRef } from "./ledger-client";

export const metadata = { title: "Ichki ledger" };

export default async function EntityLedgerPage() {
  const user = await requirePermission("transfers.read");
  const [balances, entities, settlements] = await Promise.all([
    entityLedger(),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
    prisma.entitySettlement.findMany({
      include: { fromEntity: { select: { name: true } }, toEntity: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const rows: LedgerRow[] = balances.map((b) => ({
    creditorId: b.creditorId,
    creditorName: b.creditorName,
    debtorId: b.debtorId,
    debtorName: b.debtorName,
    amount: b.amount.toNumber(),
  }));
  const refs: EntityRef[] = entities;
  const total = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Ichki ledger (sub&apos;ektlararo)</h1>
        <Button variant="outline" render={<Link href="/transfers" />}>
          <ArrowLeft className="size-4" /> Transferlar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Jami ochiq qoldiq"
          value={formatUZS(total)}
          hint={
            <span className="inline-flex items-center gap-1">
              sub&apos;ektlararo
              <InfoHint>
                Qoldiq = qabul qilingan transferlar (transferPrice × miqdor) − ichki toʻlovlar. Nashriyot
                foydasi transferPrice&apos;da tugaydi, sotuv bo&apos;limi foydasi undan boshlanadi.
              </InfoHint>
            </span>
          }
        />
        <KpiCard title="Ochiq juftliklar" value={rows.length} hint="Netlangan sub'ekt juftliklari" />
      </div>

      <LedgerClient
        rows={rows}
        refs={refs}
        settlements={settlements.map((s) => ({
          id: s.id,
          from: s.fromEntity.name,
          to: s.toEntity.name,
          amount: Number(s.amountUZS),
          note: s.note,
          date: s.date.toISOString(),
        }))}
        canSettle={user.permissions.includes("finance.write")}
      />
    </div>
  );
}
