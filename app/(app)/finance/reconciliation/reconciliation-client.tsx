"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applyMatchAction, reconcileAction } from "../actions";

export type PendingView = {
  id: string;
  direction: string;
  method: string;
  entityName: string;
  partnerId: string | null;
  partnerName: string | null;
  amount: number;
  date: string;
};

export type PartnerOption = { id: string; name: string };

type BankRow = { key: string; ref: string; partnerId: string | null; amount: string; date: string };

let seq = 0;
const nextKey = () => `bank-${seq++}`;

export function ReconciliationClient({
  pending,
  partners,
  canReconcile,
}: {
  pending: PendingView[];
  partners: PartnerOption[];
  canReconcile: boolean;
}) {
  const [busy, startTransition] = React.useTransition();
  const [bank, setBank] = React.useState<BankRow[]>([]);
  const [matches, setMatches] = React.useState<Record<string, string>>({}); // paymentId → bankRef
  const [manual, setManual] = React.useState<Record<string, string>>({}); // paymentId → typed bankRef

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function addRow() {
    setBank((b) => [...b, { key: nextKey(), ref: `BANK-${b.length + 1}`, partnerId: null, amount: "", date: new Date().toISOString().slice(0, 10) }]);
  }

  /** Convenience: mirror pending payments into a bank file so auto-match is demonstrable. */
  function fillFromPending() {
    setBank(
      pending.map((p, i) => ({
        key: nextKey(),
        ref: `BANK-${i + 1}`,
        partnerId: p.partnerId,
        amount: String(p.amount),
        date: p.date.slice(0, 10),
      })),
    );
  }

  function autoMatch() {
    const rows = bank
      .filter((b) => b.ref && b.amount)
      .map((b) => ({ ref: b.ref, partnerId: b.partnerId, amount: Number(b.amount), date: b.date }));
    if (rows.length === 0) {
      toast.error("Avval bank satrlarini kiriting");
      return;
    }
    startTransition(async () => {
      try {
        const r = await reconcileAction(rows);
        const map: Record<string, string> = {};
        for (const m of r.matches) map[m.paymentId] = m.bankRef;
        setMatches(map);
        toast.success(`${r.matches.length} moslik topildi, ${r.unmatchedBank.length} bank satri mos kelmadi`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Pending payments */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-medium">
          <span>Solishtirilmagan toʻlovlar ({pending.length})</span>
        </div>
        <div className="flex flex-col divide-y">
          {pending.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Barcha toʻlovlar solishtirilgan</p>}
          {pending.map((p) => {
            const auto = matches[p.id];
            return (
              <div key={p.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {p.partnerName ?? "—"}
                      <StatusBadge status={p.direction} tone={p.direction === "IN" ? "success" : "warning"} label={p.direction === "IN" ? "Kirim" : "Chiqim"} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.entityName} · {formatDate(p.date)} · {p.method}
                    </div>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{formatUZS(p.amount)}</span>
                </div>

                {auto ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-success/10 px-2 py-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-success">
                      <Sparkles className="size-3.5" /> Avtomatik moslik: {auto}
                    </span>
                    {canReconcile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => run(() => applyMatchAction({ paymentId: p.id, bankRef: auto }), "Solishtirildi")}
                      >
                        <Check className="size-4" /> Tasdiqlash
                      </Button>
                    )}
                  </div>
                ) : (
                  canReconcile && (
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8"
                        placeholder="Bank hujjati №"
                        value={manual[p.id] ?? ""}
                        onChange={(e) => setManual((m) => ({ ...m, [p.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !(manual[p.id] ?? "").trim()}
                        onClick={() => run(() => applyMatchAction({ paymentId: p.id, bankRef: (manual[p.id] ?? "").trim() }), "Qoʻlda solishtirildi")}
                      >
                        Qoʻlda
                      </Button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bank rows */}
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm font-medium">
          <span>Bank koʻchirmasi</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fillFromPending} disabled={busy}>
              <Wand2 className="size-4" /> Toʻlovlardan
            </Button>
            <Button size="sm" variant="outline" onClick={addRow} disabled={busy}>
              <Plus className="size-4" /> Satr
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          {bank.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Bank satrlarini qoʻshing yoki toʻlovlardan yarating</p>}
          {bank.map((b) => (
            <div key={b.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">№ / Summa</Label>
                <Input className="h-8" value={b.ref} onChange={(e) => setBank((rows) => rows.map((r) => (r.key === b.key ? { ...r, ref: e.target.value } : r)))} />
                <Input className="h-8" inputMode="numeric" placeholder="summa" value={b.amount} onChange={(e) => setBank((rows) => rows.map((r) => (r.key === b.key ? { ...r, amount: e.target.value } : r)))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Hamkor / Sana</Label>
                <Select value={b.partnerId ?? "none"} onValueChange={(v) => setBank((rows) => rows.map((r) => (r.key === b.key ? { ...r, partnerId: v === "none" ? null : v } : r)))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="h-8" type="date" value={b.date} onChange={(e) => setBank((rows) => rows.map((r) => (r.key === b.key ? { ...r, date: e.target.value } : r)))} />
              </div>
              <Button size="icon" variant="ghost" className="mb-0.5" onClick={() => setBank((rows) => rows.filter((r) => r.key !== b.key))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className={cn("border-t p-3", bank.length === 0 && "hidden")}>
          <Button className="w-full" onClick={autoMatch} disabled={busy}>
            <Sparkles className="size-4" /> Avtomatik solishtirish
          </Button>
        </div>
      </div>
    </div>
  );
}
