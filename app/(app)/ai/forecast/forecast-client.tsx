"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard } from "@/components/shared/chart-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { forecastConfidence } from "@/lib/pricing";
import { formatNumber } from "@/lib/format";
import { buildForecastAction, applyForecastAction } from "../actions";

export type ProductOption = { id: string; sku: string | null; workTitle: string };
export type ForecastView = {
  productId: string;
  history: { month: string; units: number }[];
  forecast: { id: string; values: { month: string; value: number }[]; mape: number | null } | null;
};

const CONF_TONE = { HIGH: "success", MEDIUM: "warning", LOW: "danger" } as const;
const CONF_LABEL = { HIGH: "Yuqori ishonch", MEDIUM: "Oʻrta ishonch", LOW: "Past ishonch" };

export function ForecastClient({
  options,
  selected,
  view,
  canApply,
}: {
  options: ProductOption[];
  selected: string;
  view: ForecastView | null;
  canApply: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function selectProduct(id: string | null) {
    if (id) router.push(`/ai/forecast?product=${id}`);
  }

  function build() {
    startTransition(async () => {
      try {
        const r = await buildForecastAction(selected);
        if (!r.ok) toast.error(r.reason);
        else toast.success("Prognoz qurildi");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function apply(id: string) {
    startTransition(async () => {
      try {
        await applyForecastAction(id);
        toast.success("Zaxira qoidasiga qoʻllandi (manual ROP)");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const f = view?.forecast;
  const conf = forecastConfidence(f?.mape ?? null);

  // Merge history + forecast into one series for the chart.
  const chartData = [
    ...(view?.history ?? []).map((h) => ({ month: h.month, tarix: h.units, prognoz: null as number | null })),
    ...(f?.values ?? []).map((v) => ({ month: v.month, tarix: null as number | null, prognoz: v.value })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="flex flex-col gap-1.5">
          <Label>SKU / Asar</Label>
          <Select value={selected} onValueChange={selectProduct}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.workTitle} {o.sku ? `(${o.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={build} disabled={pending || !selected}>
          <Play className="size-4" /> Prognoz qurish
        </Button>
        <p className="text-xs text-muted-foreground">
          Ansambl (harakatlanuvchi oʻrtacha + chiziqli regressiya), teskari-MAPE vazn. Kamida 18 oy tarix
          kerak.
        </p>
      </div>

      {view && view.history.length < 18 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Bu SKU uchun faqat {view.history.length} oylik tarix bor — prognoz uchun 18 oy kerak (cold-start
          ustasi keyinroq).
        </p>
      )}

      {chartData.length > 0 && (
        <ChartCard
          title="Tarix va prognoz (oylik nusxa)"
          data={chartData}
          xKey="month"
          type="line"
          height={260}
          series={[
            { key: "tarix", label: "Tarix", color: "var(--chart-1)" },
            { key: "prognoz", label: "Prognoz", color: "var(--chart-2)" },
          ]}
          valueFormatter={(v) => formatNumber(v)}
        />
      )}

      {f && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Ishonch:</span>
              <StatusBadge status={conf.level} tone={CONF_TONE[conf.level]} label={CONF_LABEL[conf.level]} />
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                MAPE {f.mape != null ? `${(f.mape * 100).toFixed(1)}%` : "—"}
                <InfoHint>
                  MAPE 40% dan yuqori boʻlsa ishonch past — avtoqoʻllash oʻchiq. Prognoz faqat inson
                  tasdigʻi bilan zaxira qoidasiga oʻtadi.
                </InfoHint>
              </span>
            </div>
            {canApply &&
              (conf.canAutoApply ? (
                <Button size="sm" onClick={() => apply(f.id)} disabled={pending}>
                  <Check className="size-4" /> Zaxira qoidasiga qoʻllash
                </Button>
              ) : (
                <span className="text-xs text-destructive">Past ishonch — qoʻllash bloklangan</span>
              ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {f.values.map((v) => (
              <span key={v.month} className="tabular-nums">
                <span className="text-muted-foreground">{v.month}:</span> {formatNumber(v.value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
