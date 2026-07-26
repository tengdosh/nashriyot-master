import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { campaignAnalytics } from "@/lib/services/leads-service";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { InfoHint } from "@/components/shared/info-hint";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatUZS } from "@/lib/format";

export const metadata = { title: "Kampaniya analitikasi" };

export default async function LeadsAnalyticsPage() {
  await requirePermission("leads.read");
  const { rows, totals } = await campaignAnalytics();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Kampaniya analitikasi</h1>
        <Button variant="outline" render={<Link href="/leads" />}>
          <ArrowLeft className="size-4" /> Lidlar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Lidlar" value={formatNumber(totals.leads)} hint={`${totals.converted} buyurtmaga aylandi`} />
        <KpiCard title="Konversiya" value={`${(totals.conversionRate.toNumber() * 100).toFixed(1)}%`} hint="Aylangan ÷ jami lid" />
        <KpiCard title="Tushum (sof)" value={formatUZS(totals.revenue.toNumber())} hint="Aylangan buyurtmalarning muhrlangan sof qiymati" />
        <KpiCard
          title="ROI"
          value={totals.roi != null ? `${(totals.roi.toNumber() * 100).toFixed(0)}%` : "—"}
          hint={
            <span className="inline-flex items-center gap-1">
              xarajat {formatUZS(totals.cost.toNumber())}
              <InfoHint>ROI = (tushum − xarajat) ÷ xarajat. CAC = marketing xarajati ÷ aylangan lidlar.</InfoHint>
            </span>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kampaniya</TableHead>
              <TableHead className="text-right">Lidlar</TableHead>
              <TableHead className="text-right">Aylangan</TableHead>
              <TableHead className="text-right">Konversiya</TableHead>
              <TableHead className="text-right">Tushum</TableHead>
              <TableHead className="text-right">Xarajat</TableHead>
              <TableHead className="text-right">CAC</TableHead>
              <TableHead className="text-right">ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Maʼlumot yoʻq</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.campaign}>
                <TableCell className="font-medium">{r.campaign}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.leads)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.converted)}</TableCell>
                <TableCell className="text-right tabular-nums">{(r.conversionRate.toNumber() * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.revenue.toNumber())}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatUZS(r.cost.toNumber())}</TableCell>
                <TableCell className="text-right tabular-nums">{r.cac != null ? formatUZS(r.cac.toNumber()) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.roi != null ? (
                    <span className={r.roi.toNumber() < 0 ? "text-destructive" : "text-success"}>{(r.roi.toNumber() * 100).toFixed(0)}%</span>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
