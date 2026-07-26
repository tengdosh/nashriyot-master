"use client";

import * as React from "react";
import { toast } from "sonner";
import { BarChart3, Download, Play, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MEASURES, DIMENSIONS, type Dimension, type Measure } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { runConstructorAction, saveReportAction, deleteReportAction } from "./actions";

type Spec = {
  measure: Measure;
  dimension: Dimension;
  secondaryDimension?: Dimension | null;
  from: string;
  to: string;
};

export type SavedReportView = { id: string; name: string; spec: Spec; createdBy: string | null };

type PivotResult = {
  columns: string[];
  rows: { key: string; cells: Record<string, number>; total: number }[];
  columnTotals: Record<string, number>;
  grandTotal: number;
};

const NONE = "__none__";
const MEASURE_LABEL = Object.fromEntries(MEASURES.map((m) => [m.key, m.label]));

export function AnalyticsConstructor({ saved, canSave }: { saved: SavedReportView[]; canSave: boolean }) {
  const year = new Date().getUTCFullYear();
  const [pending, startTransition] = React.useTransition();
  const [measure, setMeasure] = React.useState<Measure>("revenue");
  const [dimension, setDimension] = React.useState<Dimension>("title");
  const [secondary, setSecondary] = React.useState<string>("month");
  const [from, setFrom] = React.useState(`${year}-01`);
  const [to, setTo] = React.useState(`${year}-12`);
  const [result, setResult] = React.useState<PivotResult | null>(null);
  const [name, setName] = React.useState("");

  function spec(): Spec {
    return {
      measure,
      dimension,
      secondaryDimension: secondary === NONE ? null : (secondary as Dimension),
      from,
      to,
    };
  }

  function run() {
    startTransition(async () => {
      try {
        setResult(await runConstructorAction(spec()));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await saveReportAction(name, spec());
        toast.success("Hisobot saqlandi");
        setName("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function loadSaved(s: SavedReportView) {
    setMeasure(s.spec.measure);
    setDimension(s.spec.dimension);
    setSecondary(s.spec.secondaryDimension ?? NONE);
    setFrom(s.spec.from);
    setTo(s.spec.to);
    startTransition(async () => {
      try {
        setResult(await runConstructorAction(s.spec));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function exportCsv() {
    if (!result) return;
    const header = ["", ...result.columns, "Jami"].join(",");
    const lines = result.rows.map((r) =>
      [JSON.stringify(r.key), ...result.columns.map((c) => r.cells[c] ?? 0), r.total].join(","),
    );
    const totalRow = ["Jami", ...result.columns.map((c) => result.columnTotals[c] ?? 0), result.grandTotal].join(",");
    const csv = [header, ...lines, totalRow].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "analitika.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxTotal = result ? Math.max(...result.rows.map((r) => Math.abs(r.total)), 1) : 1;
  const single = result?.columns.length === 1 && result.columns[0] === "__total__";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Hisobot konstruktori</h2>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <Field label="Oʻlchov">
          <Select value={measure} onValueChange={(v) => setMeasure((v as Measure) ?? "revenue")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEASURES.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kesim (satr)">
          <Select value={dimension} onValueChange={(v) => setDimension((v as Dimension) ?? "title")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ustun (ixtiyoriy)">
          <Select value={secondary} onValueChange={(v) => setSecondary(v ?? NONE)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— yoʻq —</SelectItem>
              {DIMENSIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Dan (YYYY-MM)">
          <Input className="w-28" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Gacha">
          <Input className="w-28" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={run} disabled={pending}>
          <Play className="size-4" /> Hisoblash
        </Button>
        {result && (
          <Button variant="outline" onClick={exportCsv} disabled={pending}>
            <Download className="size-4" /> CSV
          </Button>
        )}
        {canSave && result && (
          <div className="flex items-end gap-1">
            <Input className="w-40" placeholder="Hisobot nomi" value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="outline" onClick={save} disabled={pending || !name.trim()}>
              <Save className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Saqlangan:</span>
          {saved.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              <button type="button" className="hover:underline" onClick={() => loadSaved(s)}>
                {s.name}
              </button>
              <button
                type="button"
                aria-label="Oʻchirish"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await deleteReportAction(s.id);
                      toast.success("Oʻchirildi");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Xatolik");
                    }
                  })
                }
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {result && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{DIMENSIONS.find((d) => d.key === dimension)?.label}</TableHead>
                {!single &&
                  result.columns.map((c) => (
                    <TableHead key={c} className="text-right">{c}</TableHead>
                  ))}
                <TableHead className="text-right">{single ? MEASURE_LABEL[measure] : "Jami"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={result.columns.length + 2} className="py-8 text-center text-muted-foreground">
                    Bu davr uchun maʼlumot yoʻq.
                  </TableCell>
                </TableRow>
              )}
              {result.rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">
                    {single ? (
                      <div className="flex items-center gap-2">
                        <span className="min-w-32">{r.key}</span>
                        <span
                          className="inline-block h-2 rounded-sm bg-primary/60"
                          style={{ width: `${(Math.abs(r.total) / maxTotal) * 120}px` }}
                        />
                      </div>
                    ) : (
                      r.key
                    )}
                  </TableCell>
                  {!single &&
                    result.columns.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums">
                        {r.cells[c] ? formatNumber(r.cells[c]) : "—"}
                      </TableCell>
                    ))}
                  <TableCell className="text-right font-medium tabular-nums">{formatNumber(r.total)}</TableCell>
                </TableRow>
              ))}
              {result.rows.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Jami</TableCell>
                  {!single &&
                    result.columns.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums">
                        {formatNumber(result.columnTotals[c] ?? 0)}
                      </TableCell>
                    ))}
                  <TableCell className="text-right tabular-nums">{formatNumber(result.grandTotal)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
