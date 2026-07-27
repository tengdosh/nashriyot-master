"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileUp, CheckCircle2, AlertTriangle, ScanLine, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/shared/info-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUZS, formatNumber } from "@/lib/format";
import { previewImportAction, commitImportAction } from "./actions";

type Template = "kirimlar" | "sotuv";

type Coverage = {
  sotuvOrders: number;
  sotuvLastDate: string | null;
  kirimlarLayers: number;
  kirimlarTotalQty: number;
  kirimlarLastDate: string | null;
};

const HEADERS: Record<Template, string> = {
  kirimlar: "Sana, Kitoblar, Miqdor, Narxi, Chegirma, Summa_dona, Umumiy, Yetkazib beruvchi",
  sotuv: "Sana, Klient, Holat, Kitoblar, Kirim, Sotuv_narxi, Soni, Chegirma, Qoshimcha_xarajat, Summa, Foyda",
};

type Summary = {
  rows: number;
  newTitles: number;
  newProducts: number;
  newPartners: number;
  layers: number;
  orders: number;
  totalValue: number;
};
type RowError = { row: number; message: string };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function ImportClient({ coverage }: { coverage: Coverage }) {
  const [pending, startTransition] = React.useTransition();
  const [template, setTemplate] = React.useState<Template>("kirimlar");
  const [csv, setCsv] = React.useState("");
  const [preview, setPreview] = React.useState<{ summary: Summary; errors: RowError[] } | null>(null);
  const [committed, setCommitted] = React.useState<Summary | null>(null);

  function reset() {
    setPreview(null);
    setCommitted(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      reset();
    };
    reader.readAsText(file);
  }

  function doPreview() {
    startTransition(async () => {
      try {
        const r = await previewImportAction(template, csv);
        setPreview({ summary: r.summary, errors: r.errors });
        setCommitted(null);
        toast.success(`Tekshirildi: ${r.summary.rows} qator, ${r.errors.length} xato`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function doCommit() {
    startTransition(async () => {
      try {
        const r = await commitImportAction(template, csv);
        setCommitted(r);
        setPreview(null);
        toast.success("Import yakunlandi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const s = preview?.summary ?? committed;

  return (
    <div className="flex flex-col gap-4">
      {/* Import qamrovi — persistent DB-derived stats */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Database className="size-4 text-muted-foreground" />
          Import qamrovi
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-background p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Sotuv (buyurtmalar)</div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-xl font-semibold tabular-nums">{formatNumber(coverage.sotuvOrders)}</div>
                <div className="text-xs text-muted-foreground">yuklangan buyurtma</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Oxirgi: {fmtDate(coverage.sotuvLastDate)}
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Kirimlar (FIFO qatlamlari)</div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-xl font-semibold tabular-nums">{formatNumber(coverage.kirimlarLayers)}</div>
                <div className="text-xs text-muted-foreground">qatlam · {formatNumber(coverage.kirimlarTotalQty)} dona</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Oxirgi: {fmtDate(coverage.kirimlarLastDate)}
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bu raqamlar bazada mavjud Import kanal buyurtmalari va FIFO IN harakatlaridan hisoblanadi.
          Fayl qatorlari va o&rsquo;tkazib yuborilgan soni sinov rejimida (Tekshirish) ko&rsquo;rinadi.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Shablon</Label>
            <Select value={template} onValueChange={(v) => { setTemplate((v as Template) ?? "kirimlar"); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kirimlar">Kirimlar (katalog + FIFO)</SelectItem>
                <SelectItem value="sotuv">Sotuv (buyurtmalar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1 font-medium">
              Kutilgan ustunlar
              <InfoHint>Ustun nomlari katta-kichik harf va bo&apos;sh joy/pastki chiziqqa sezgir emas. Sana: dd.mm.yyyy.</InfoHint>
            </div>
            <code className="text-muted-foreground">{HEADERS[template]}</code>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5"><FileUp className="size-4" /> CSV fayl</Label>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-sm" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>CSV matni</Label>
          <textarea
            value={csv}
            onChange={(e) => { setCsv(e.target.value); reset(); }}
            placeholder={HEADERS[template] + "\n..."}
            spellCheck={false}
            className="h-56 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={doPreview} disabled={pending || !csv.trim()}>
              <ScanLine className="size-4" /> Tekshirish (sinov)
            </Button>
            <Button
              onClick={doCommit}
              disabled={pending || !preview || preview.summary.rows === 0}
              title={!preview ? "Avval tekshiring" : undefined}
            >
              <CheckCircle2 className="size-4" /> Import qilish
            </Button>
          </div>
        </div>
      </div>

      {committed && (
        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Import yakunlandi va bazaga yozildi.
        </div>
      )}

      {s && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Qatorlar", formatNumber(s.rows)],
            ["Yangi kitob", formatNumber(s.newTitles)],
            ["Yangi SKU", formatNumber(s.newProducts)],
            ["Yangi hamkor", formatNumber(s.newPartners)],
            [template === "kirimlar" ? "FIFO qatlam" : "Buyurtma", formatNumber(template === "kirimlar" ? s.layers : s.orders)],
            ["Qiymat", formatUZS(s.totalValue)],
          ].map(([label, val]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{val}</div>
            </div>
          ))}
        </div>
      )}

      {preview && preview.errors.length > 0 && (
        <div className="rounded-lg border border-warning/40">
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" /> {preview.errors.length} xato — bu qatorlar import qilinmaydi
          </div>
          <div className="max-h-64 overflow-y-auto p-2 text-sm">
            {preview.errors.slice(0, 100).map((e, i) => (
              <div key={i} className="flex gap-2 px-2 py-1">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{e.row}-qator</span>
                <span>{e.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
