"use client";

import * as React from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";

export type DetailView = {
  workTitle: string;
  sku: string | null;
  history: { date: string; reportCost: number; decisionCost: number; expNet: number }[];
  layers: { unique: number; print: number; accruedFixed: number };
};

const LAYER_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function CostingDetail({ view }: { view: DetailView }) {
  const { unique, print, accruedFixed } = view.layers;
  const total = unique + print + accruedFixed || 1;
  const slices = [
    { label: "Unikal", value: unique },
    { label: "Bosma (FIFO)", value: print },
    { label: "Doimiy (yig'ilgan)", value: accruedFixed },
  ];

  // Conic-gradient donut of the reportCost layers.
  let acc = 0;
  const stops = slices
    .map((s, i) => {
      const from = (acc / total) * 100;
      acc += s.value;
      return `${LAYER_COLORS[i]} ${from}% ${(acc / total) * 100}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col gap-4">
      {view.history.length >= 2 ? (
        <ChartCard
          title="reportCost (o'suvchi) va kutilgan sof narx (pasayuvchi)"
          description="Kesishish = qaytmas nuqta"
          data={view.history}
          xKey="date"
          type="line"
          height={280}
          series={[
            { key: "reportCost", label: "reportCost", color: "var(--chart-1)" },
            { key: "expNet", label: "Kutilgan sof", color: "var(--chart-2)" },
            { key: "decisionCost", label: "decisionCost (pol)", color: "var(--chart-3)" },
          ]}
          valueFormatter={(v) => formatUZS(v)}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Grafik uchun kamida 2 kunlik surat kerak. Har tunda (yoki qoʻlda) suratga olinadi.
        </div>
      )}

      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-1 text-sm font-medium">
          reportCost qatlamlari
          <InfoHint>Uch qatlam DB da alohida saqlanadi va faqat shu yerda birlashtiriladi — ikki marta sanalmaydi.</InfoHint>
        </div>
        <div className="flex items-center gap-6">
          <div
            className="relative size-32 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${stops})` }}
            aria-hidden
          >
            <div className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-background">
              <span className="text-[10px] text-muted-foreground">Jami</span>
              <span className="text-xs font-semibold tabular-nums">{formatUZS(unique + print + accruedFixed)}</span>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: LAYER_COLORS[i] }} />
                <span className="min-w-40">{s.label}</span>
                <span className="tabular-nums">{formatUZS(s.value)}</span>
                <span className="text-xs text-muted-foreground">
                  {(((s.value || 0) / total) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          decisionCost = faqat bosma + kunlik saqlash. Unikal va doimiy qatlamlar unga KIRMAYDI — narx poli
          shu sababli sunk&apos;siz.
        </p>
      </div>
    </div>
  );
}
