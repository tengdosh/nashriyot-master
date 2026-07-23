"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyText } from "@/components/shared/money";
import { InfoHint } from "@/components/shared/info-hint";
import { computeScenario, type ScenarioInputs, type ScenarioResults } from "@/lib/scenario";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveScenarioAction, approveScenarioAction } from "./actions";

type TitleOpt = { id: string; workTitle: string };
type Existing = {
  id: string;
  name: string;
  titleId: string | null;
  fixedCosts: { label: string; amount: number }[];
  pagesCount: number;
  perPageCost: number;
  fixedPrintCost: number;
  printRun: number;
  sellThroughRate: number;
  discountRate: number;
  royaltyRate: number;
  targetMargin: number;
  approved: boolean;
};

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
function safeCompute(i: ScenarioInputs): ScenarioResults | null {
  try {
    return computeScenario(i);
  } catch {
    return null;
  }
}

export function ScenarioEditor({ titles, existing }: { titles: TitleOpt[]; existing: Existing | null }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [savedId, setSavedId] = React.useState<string | null>(existing?.id ?? null);
  const [approved, setApproved] = React.useState(existing?.approved ?? false);

  const [name, setName] = React.useState(existing?.name ?? "Yangi ssenariy");
  const [titleId, setTitleId] = React.useState(existing?.titleId ?? titles[0]?.id ?? "");
  const [fixedCosts, setFixedCosts] = React.useState<{ label: string; amount: number }[]>(
    existing?.fixedCosts ?? [{ label: "Huquq/tarjima", amount: 12_000_000 }],
  );
  const [pagesCount, setPagesCount] = React.useState(existing?.pagesCount ?? 384);
  const [perPageCost, setPerPageCost] = React.useState(existing?.perPageCost ?? 95);
  const [fixedPrintCost, setFixedPrintCost] = React.useState(existing?.fixedPrintCost ?? 3000);
  const [printRun, setPrintRun] = React.useState(existing?.printRun ?? 3000);
  const [sellThrough, setSellThrough] = React.useState(existing?.sellThroughRate ?? 0.8);
  const [discount, setDiscount] = React.useState(existing?.discountRate ?? 0.45);
  const [royalty, setRoyalty] = React.useState(existing?.royaltyRate ?? 0.1);
  const [margin, setMargin] = React.useState(existing?.targetMargin ?? 0.2);
  const [secondEd, setSecondEd] = React.useState(false);

  const inputs: ScenarioInputs = {
    fixedCosts: fixedCosts.map((f) => f.amount),
    pagesCount,
    perPageCost,
    fixedPrintCost,
    printRun,
    sellThroughRate: sellThrough,
    discountRate: discount,
    royaltyRate: royalty,
    targetMargin: margin,
  };
  const normal = safeCompute(inputs);
  const reprint = safeCompute({ ...inputs, secondEditionMode: true });

  function save() {
    if (!normal) {
      toast.error("Hisob xatosi — kirishlarni tekshiring");
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveScenarioAction({
          id: savedId,
          name,
          titleId: titleId || null,
          editionId: null,
          fixedCosts,
          pagesCount,
          perPageCost,
          fixedPrintCost,
          printRun,
          sellThroughRate: sellThrough,
          discountRate: discount,
          royaltyRate: royalty,
          targetMargin: margin,
          clientResults: { uc: normal.uc, pmin: normal.pmin, rrp: normal.rrp },
        });
        setSavedId(res.id);
        toast.success("Saqlandi");
        router.replace(`/acquisitions/${res.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function copyAsNew() {
    setSavedId(null);
    setApproved(false);
    setName(`${name} (nusxa)`);
    toast.info("Nusxa — saqlaganda yangi ssenariy yaratiladi");
  }

  function approve() {
    if (!savedId) {
      toast.error("Avval saqlang");
      return;
    }
    if (!titleId) {
      toast.error("Ssenariyni asarga bogʻlang");
      return;
    }
    startTransition(async () => {
      try {
        const r = await approveScenarioAction(savedId);
        setApproved(true);
        toast.success(`Tasdiqlandi — nashr rejasi + ${r.costDrafts} ta xarajat qoralamasi`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">P&amp;L ssenariy</h1>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm">
            <input type="checkbox" checked={secondEd} onChange={(e) => setSecondEd(e.target.checked)} />
            2-nashr rejimi (unikal = 0)
          </label>
          <Button variant="outline" size="sm" onClick={copyAsNew}>
            <Copy className="size-4" /> Nusxalash
          </Button>
          <Button variant="outline" size="sm" onClick={approve} disabled={pending || !savedId || approved}>
            <CheckCircle2 className="size-4" /> {approved ? "Tasdiqlangan" : "APPROVED"}
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="size-4" /> Saqlash
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* LEFT — inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Kirishlar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Asar">
                <Select value={titleId} onValueChange={(v) => setTitleId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {titles.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.workTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Fixed (unique) cost rows */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Doimiy (unikal) xarajatlar</Label>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setFixedCosts((r) => [...r, { label: "Xarajat", amount: 0 }])}
                >
                  <Plus className="size-3.5" /> Qator
                </Button>
              </div>
              {fixedCosts.map((fc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    value={fc.label}
                    onChange={(e) =>
                      setFixedCosts((r) => r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <Input
                    type="number"
                    className="w-40 text-right tabular-nums"
                    value={fc.amount}
                    onChange={(e) =>
                      setFixedCosts((r) =>
                        r.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFixedCosts((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {secondEd && (
                <p className="text-xs text-warning">
                  2-nashr rejimida unikal xarajatlar hisobga OLINMAYDI.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumField label="Sahifa soni" value={pagesCount} onChange={setPagesCount} />
              <NumField label="Sahifa narxi" value={perPageCost} onChange={setPerPageCost} />
              <NumField label="Doimiy bosma" value={fixedPrintCost} onChange={setFixedPrintCost} />
              <NumField label="Adad (tiraj)" value={printRun} onChange={setPrintRun} />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Slider label="Sotilish" value={sellThrough} onChange={setSellThrough} min={0.05} />
              <Slider label="Chegirma" value={discount} onChange={setDiscount} />
              <Slider label="Royalti" value={royalty} onChange={setRoyalty} />
              <Slider label="Marja" value={margin} onChange={setMargin} />
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — live results */}
        <Card>
          <CardHeader>
            <CardTitle>Natijalar {secondEd ? "— 1-nashr vs 2-nashr" : "(jonli)"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!normal ? (
              <p className="text-sm text-destructive">Hisob xatosi — kirishlarni tekshiring (maxraj ≤ 0?).</p>
            ) : secondEd && reprint ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-2 border-b pb-1 font-medium text-muted-foreground">
                  <span></span>
                  <span className="text-right">1-nashr</span>
                  <span className="text-right">2-nashr</span>
                  <span className="text-right">Farq</span>
                </div>
                <CompareRow label="UC" a={normal.uc} b={reprint.uc} />
                <CompareRow label="P_min" a={normal.pmin} b={reprint.pmin} />
                <CompareRow label="RRP" a={normal.rrp} b={reprint.rrp} />
                <CompareRow label="Qaytmas" a={normal.breakEven} b={reprint.breakEven} money={false} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <Big label="P_min" value={normal.pmin} hint={`UC / (1 − chegirma − royalti) = ${formatNumber(normal.uc)} / ${(1 - discount - royalty).toFixed(2)}`} />
                  <Big label="RRP" value={normal.rrp} hint={`UC / (1 − ${pct(discount)} − ${pct(royalty)} − ${pct(margin)}), yaxlitlangan`} />
                  <Big label="UC (birlik)" value={normal.uc} hint={`TC / (adad × sotilish) = ${formatNumber(normal.tc)} / (${printRun} × ${pct(sellThrough)})`} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Small label="PC (bosma birlik)" value={normal.pc} hint={`doimiy bosma + sahifa × narx = ${fixedPrintCost} + ${pagesCount}×${perPageCost}`} />
                  <Small label="TC (jami)" value={normal.tc} hint="Σ doimiy + adad × PC" />
                  <Small label="Qaytmas nuqta" value={normal.breakEven} money={false} hint="doimiy / birlik marja (dona)" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        className="text-right tabular-nums"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
function Slider({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary"
      />
    </div>
  );
}
function Big({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} <InfoHint>{hint}</InfoHint>
      </div>
      <div className="mt-1 text-lg font-semibold">
        <MoneyText value={value} />
      </div>
    </div>
  );
}
function Small({
  label,
  value,
  hint,
  money = true,
}: {
  label: string;
  value: number;
  hint: string;
  money?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} <InfoHint>{hint}</InfoHint>
      </div>
      <div className="mt-1 font-medium tabular-nums">
        {money ? <MoneyText value={value} /> : formatNumber(value)}
      </div>
    </div>
  );
}
function CompareRow({ label, a, b, money = true }: { label: string; a: number; b: number; money?: boolean }) {
  const diff = b - a;
  return (
    <div className="grid grid-cols-[7rem_1fr_1fr_1fr] items-center gap-2 tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{money ? <MoneyText value={a} /> : formatNumber(a)}</span>
      <span className="text-right">{money ? <MoneyText value={b} /> : formatNumber(b)}</span>
      <span className={cn("text-right font-medium", diff < 0 ? "text-success" : diff > 0 ? "text-destructive" : "")}>
        {diff > 0 ? "+" : ""}
        {money ? <MoneyText value={diff} /> : formatNumber(diff)}
      </span>
    </div>
  );
}
