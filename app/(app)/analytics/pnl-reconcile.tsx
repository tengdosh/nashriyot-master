"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

// Etalon: Foyda_Zarar_2026.html — Tasnim + Tahlil jami, yanvar–iyun 2026
const BENCHMARK: Record<string, number> = {
  "2026-01": 368_304_000,
  "2026-02": 318_696_000,
  "2026-03": 340_678_000,
  "2026-04": 352_613_000,
  "2026-05": 598_791_000,
  "2026-06": 663_909_000,
};

const MONTH_LABELS: Record<string, string> = {
  "2026-01": "Yanvar 2026",
  "2026-02": "Fevral 2026",
  "2026-03": "Mart 2026",
  "2026-04": "Aprel 2026",
  "2026-05": "May 2026",
  "2026-06": "Iyun 2026",
};

const CAUSES = [
  {
    title: "CSV to'liqsizligi (asosiy sabab)",
    body: "sotuv.csv da 843 ta tranzaksiya bor, jami 803–804 mln so'm. Bu 2026 H1 uchun real biznesning faqat ~30.5%i. Qolgan ~69.5% (≈1.84 mlrd) CSV eksportga kirmagan — to'liq CSV eksport kerak.",
    color: "border-l-destructive",
  },
  {
    title: "Entity mapping xatosi (tuzatildi)",
    body: "Import service barcha buyurtmalarni birinchi PUBLISHER entityga (Tahlil) biriktirirdi. Tuzatish: har bir kitobning title.entityId'dan olinadi — Tasnim/Tahlil to'g'ri farqlanadi.",
    color: "border-l-warning",
  },
  {
    title: "mv feeRate chegirilishi (minor)",
    body: "mv_monthly_sales net_revenue = chegirma × kanal komissiyasi (feeRate). Etalon faqat chegirmadan keyingi summa. Import kanallari feeRate=0 bo'lgani uchun bu farq import ma'lumotlariga ta'sir qilmaydi.",
    color: "border-l-primary",
  },
] as const;

export type PnlReconcileRow = { month: string; revenue: number };

export function PnlReconcile({
  actual,
  goLiveDateMonth,
}: {
  actual: PnlReconcileRow[];
  /** YYYY-MM — months BEFORE this are shown with a tarixiy warning */
  goLiveDateMonth?: string | null;
}) {
  const months = Object.keys(BENCHMARK).sort();
  const actualByMonth = new Map(actual.map((r) => [r.month, r.revenue]));

  const rows = months.map((m) => {
    const benchmark = BENCHMARK[m] ?? 0;
    const fact = actualByMonth.get(m) ?? 0;
    const diff = fact - benchmark;
    const pct = benchmark !== 0 ? (diff / benchmark) * 100 : 0;
    return { month: m, benchmark, fact, diff, pct };
  });

  const totalBenchmark = rows.reduce((s, r) => s + r.benchmark, 0);
  const totalFact = rows.reduce((s, r) => s + r.fact, 0);
  const totalDiff = totalFact - totalBenchmark;
  const totalPct = totalBenchmark !== 0 ? (totalDiff / totalBenchmark) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Etalon vs Import ma&#39;lumotlari</h2>
        <span className="text-sm text-muted-foreground">2026 H1</span>
        <InfoHint>
          Etalon — Foyda_Zarar_2026.html (Tasnim + Tahlil jami, chegirmadan keyingi).
          Import — faqat sotuv.csv orqali yuklangan buyurtmalar (Import kanal, feeRate=0).
          Demo seed ma&#39;lumotlari bu taqqoslashga kirmaydi.
        </InfoHint>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Etalon (HTML)</TableHead>
              <TableHead className="text-right">Import-only</TableHead>
              <TableHead className="text-right">Farq</TableHead>
              <TableHead className="text-right">% Farq</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell className="font-medium">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {MONTH_LABELS[r.month] ?? r.month}
                    {goLiveDateMonth && r.month < goLiveDateMonth && (
                      <span className="inline-flex items-center gap-0.5 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning leading-none">
                        ⚠ tarixiy
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUZS(r.benchmark)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.fact > 0 ? formatUZS(r.fact) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-medium",
                    r.diff >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {r.diff >= 0 ? "+" : ""}
                  {formatUZS(r.diff)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-medium",
                    r.pct >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {r.pct >= 0 ? "+" : ""}
                  {r.pct.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/50">
              <TableCell>JAMI</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUZS(totalBenchmark)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUZS(totalFact)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  totalDiff >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {totalDiff >= 0 ? "+" : ""}
                {formatUZS(totalDiff)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  totalPct >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {totalPct >= 0 ? "+" : ""}
                {totalPct.toFixed(1)}%
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAUSES.map((c, i) => (
          <Card key={i} className={cn("border-l-4", c.color)} size="sm">
            <CardHeader>
              <CardTitle className="text-sm">{c.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
