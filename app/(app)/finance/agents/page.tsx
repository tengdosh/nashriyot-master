import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { agentKpiReport } from "@/lib/services/finance-service";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/shared/info-hint";
import { formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Agent KPI" };

export default async function AgentsKpiPage() {
  await requirePermission("finance.read");
  const rows = await agentKpiReport();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent KPI</h1>
          <p className="text-sm text-muted-foreground">Soʻnggi 90 kun kesimida</p>
        </div>
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft className="size-4" /> Moliya markazi
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Chegirma</TableHead>
              <TableHead className="text-right">Sotuv (sof)</TableHead>
              <TableHead className="text-right">Yigʻilgan</TableHead>
              <TableHead className="text-right">Qarz qoldigʻi</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  DSO
                  <InfoHint>Days Sales Outstanding = qarz ÷ (sof sotuv ÷ davr kunlari). Qancha kam boʻlsa, shuncha tez pul yigʻiladi.</InfoHint>
                </span>
              </TableHead>
              <TableHead className="text-right">Qaytish %</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  Zaxira yoshi
                  <InfoHint>Agent konsignatsiya omboridagi qolgan FIFO qatlamlarining ogʻirlikli oʻrtacha yoshi (kun).</InfoHint>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Agent maʼlumoti yoʻq</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.partnerId}>
                <TableCell className="font-medium">{r.partnerName}</TableCell>
                <TableCell className="text-right tabular-nums">{(r.discount.toNumber() * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.salesNet.toNumber())}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.collected.toNumber())}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.arOutstanding.toNumber())}</TableCell>
                <TableCell className={cn("text-right tabular-nums", r.dso > 45 && "font-medium text-destructive")}>
                  {r.salesNet.gt(0) ? `${formatNumber(r.dso)} kun` : "—"}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", r.returnRatePct > 10 && "text-destructive")}>
                  {r.returnRatePct.toFixed(1)}%
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", r.stockAgeDays > 180 && "text-warning")}>
                  {r.stockAgeDays > 0 ? `${formatNumber(r.stockAgeDays)} kun` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
