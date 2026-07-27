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

// Etalon raqamlari (Foyda_Zarar_2026.html dan)
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
    title: "sotuv.csv — faqat Tasnim ma'lumotlari",
    body: "1 714 qatorning barchasi Tasnim nashriyotiga tegishli. Tahlil nashriyotining ~823 mln so'mlik savdo ma'lumotlari import qilinmagan.",
    color: "border-l-destructive",
  },
  {
    title: "Demo seed kichik hajm (~48.8%)",
    body: "seed-demo.ts dagi monthlyQty qiymatlari etalon savdo hajmining taxminan yarmi. Masalan T20: 556 o'rniga 1 200 dona/oy kerak.",
    color: "border-l-warning",
  },
  {
    title: "mv_monthly_sales kanal to'lovini chegiradi",
    body: "MV net_revenue = gross minus kanal komissiyasi. Etalon esa gross tushum ko'rsatadi — bu metodologik farq -5% dan -15% qo'shimcha og'ish beradi.",
    color: "border-l-primary",
  },
] as const;

export type PnlReconcileRow = { month: string; revenue: number };

export function PnlReconcile({ actual }: { actual: PnlReconcileRow[] }) {
  // Barcha oylar: etalon yoki haqiqiyda bor bo'lgan oylar
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
        <h2 className="text-lg font-semibold tracking-tight">Etalon vs Haqiqiy</h2>
        <span className="text-sm text-muted-foreground">2026 H1</span>
        <InfoHint>
          Etalon — Foyda_Zarar_2026.html (gross tushum). Haqiqiy —
          mv_monthly_sales (net tushum, kanal to&#39;lovlari ayirilgan). Farq
          metodologik va ma&#39;lumot yetishmasligi sabablari bilan izohlanadi.
        </InfoHint>
      </div>

      {/* Jadval */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Etalon</TableHead>
              <TableHead className="text-right">Haqiqiy (MV)</TableHead>
              <TableHead className="text-right">Farq</TableHead>
              <TableHead className="text-right">% Farq</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell className="font-medium">
                  {MONTH_LABELS[r.month] ?? r.month}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUZS(r.benchmark)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUZS(r.fact)}
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
            {/* Jami qatori */}
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

      {/* Sabab kartochalari */}
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
