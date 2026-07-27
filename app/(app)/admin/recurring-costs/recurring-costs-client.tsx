"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Play, Plus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createRecurringCostAction,
  updateRecurringCostAction,
  archiveRecurringCostAction,
  applyRecurringCostsAction,
} from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecurringCostRow = {
  id:         string;
  entityId:   string;
  entityName: string;
  label:      string;
  amount:     number;
  currency:   string;
  rate:       number;
  category:   string;
  scope:      string;
  dayOfMonth: number;
  startMonth: string;
  endMonth:   string | null;
  lastRunAt:  string | null;
  archivedAt: string | null;
};

export type RefData = {
  entities:     { id: string; name: string }[];
  currentMonth: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string }[] = [
  { value: "HUQUQ",           label: "Huquq" },
  { value: "TARJIMA",         label: "Tarjima" },
  { value: "TAHRIR",          label: "Tahrir" },
  { value: "DIZAYN",          label: "Dizayn" },
  { value: "MUALLIF_BUYOUT",  label: "Muallif buyout" },
  { value: "BOSMA",           label: "Bosma" },
  { value: "MARKETING_TITLE", label: "Marketing (kitob)" },
  { value: "MARKETING_BRAND", label: "Marketing (brand)" },
  { value: "IJARA",           label: "Ijara" },
  { value: "OYLIK",           label: "Oylik" },
  { value: "KOMMUNAL",        label: "Kommunal" },
  { value: "BOSHQA",          label: "Boshqa" },
];

const CURRENCIES = ["UZS", "USD", "EUR", "TRY"] as const;

const SCOPES: { value: string; label: string }[] = [
  { value: "FIXED", label: "Doimiy (har oy bir xil)" },
  { value: "VAR",   label: "O'zgaruvchan" },
];

function fmtAmount(amount: number, currency: string) {
  if (currency === "UZS") return `${amount.toLocaleString("uz-UZ")} so'm`;
  return `${amount.toLocaleString()} ${currency}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uz-UZ");
}

// ── Component ─────────────────────────────────────────────────────────────────

type FormState = {
  entityId:   string;
  label:      string;
  amount:     string;
  currency:   string;
  rate:       string;
  category:   string;
  scope:      string;
  dayOfMonth: string;
  startMonth: string;
  endMonth:   string;
};

function emptyForm(entities: RefData["entities"], currentMonth: string): FormState {
  return {
    entityId:   entities[0]?.id ?? "",
    label:      "",
    amount:     "",
    currency:   "UZS",
    rate:       "1",
    category:   "BOSHQA",
    scope:      "FIXED",
    dayOfMonth: "1",
    startMonth: currentMonth,
    endMonth:   "",
  };
}

function rowToForm(row: RecurringCostRow): FormState {
  return {
    entityId:   row.entityId,
    label:      row.label,
    amount:     String(row.amount),
    currency:   row.currency,
    rate:       String(row.rate),
    category:   row.category,
    scope:      row.scope,
    dayOfMonth: String(row.dayOfMonth),
    startMonth: row.startMonth,
    endMonth:   row.endMonth ?? "",
  };
}

export function RecurringCostsClient({
  rows,
  refs,
}: {
  rows: RecurringCostRow[];
  refs: RefData;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = React.useState<RecurringCostRow | null>(null);
  const [form, setForm] = React.useState<FormState>(() => emptyForm(refs.entities, refs.currentMonth));

  function openCreate() {
    setForm(emptyForm(refs.entities, refs.currentMonth));
    setEditing(null);
    setMode("create");
  }

  function openEdit(row: RecurringCostRow) {
    setForm(rowToForm(row));
    setEditing(row);
    setMode("edit");
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function buildInput() {
    return {
      entityId:   form.entityId,
      label:      form.label,
      amount:     parseFloat(form.amount),
      currency:   form.currency,
      rate:       parseFloat(form.rate) || 1,
      category:   form.category,
      scope:      form.scope,
      dayOfMonth: parseInt(form.dayOfMonth) || 1,
      startMonth: form.startMonth,
      endMonth:   form.endMonth || null,
    };
  }

  function submit() {
    startTransition(async () => {
      try {
        const input = buildInput();
        if (mode === "create") {
          await createRecurringCostAction(input);
          toast.success("Takroriy xarajat qo'shildi");
        } else if (mode === "edit" && editing) {
          await updateRecurringCostAction(editing.id, input);
          toast.success("Saqlandi");
        }
        setMode(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function archive(row: RecurringCostRow) {
    startTransition(async () => {
      try {
        await archiveRecurringCostAction(row.id);
        toast.success("Arxivlandi");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function runNow() {
    startTransition(async () => {
      try {
        const result = await applyRecurringCostsAction(refs.currentMonth);
        toast.success(`${result.created} ta yangi, ${result.skipped} ta o'tkazib yuborildi`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<RecurringCostRow>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Nomi / Sub'ekt",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.label}</span>
            <span className="text-xs text-muted-foreground">{row.original.entityName}</span>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Summa",
        cell: ({ row }) => (
          <span className="tabular-nums">{fmtAmount(row.original.amount, row.original.currency)}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Kategoriya",
        cell: ({ row }) => {
          const cat = CATEGORIES.find((c) => c.value === row.original.category);
          return <span className="text-sm">{cat?.label ?? row.original.category}</span>;
        },
      },
      {
        accessorKey: "dayOfMonth",
        header: "Kun",
        cell: ({ row }) => <span className="tabular-nums">{row.original.dayOfMonth}</span>,
      },
      {
        accessorKey: "startMonth",
        header: "Davr",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.startMonth} – {row.original.endMonth ?? "∞"}
          </span>
        ),
      },
      {
        accessorKey: "lastRunAt",
        header: "So'ngi bajarish",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{fmtDate(row.original.lastRunAt)}</span>
        ),
      },
      {
        accessorKey: "scope",
        header: "Tur",
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.scope}
            tone={row.original.scope === "FIXED" ? "success" : "warning"}
            label={row.original.scope === "FIXED" ? "Doimiy" : "O'zgaruvchan"}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {!row.original.archivedAt && (
              <>
                <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
                  Tahrir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => archive(row.original)}
                  title="Arxivlash"
                  disabled={pending}
                >
                  <Archive className="size-4" />
                </Button>
              </>
            )}
            {row.original.archivedAt && (
              <StatusBadge status="ARCHIVED" tone="muted" label="Arxivlangan" />
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending],
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Qo&apos;shish
        </Button>
        <Button variant="outline" onClick={runNow} disabled={pending} title={`${refs.currentMonth} uchun hozir ishlatish`}>
          <Play className="size-4" /> Hozir ishlatish ({refs.currentMonth})
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Nom yoki sub'ekt…"
        csvFileName="takroriy-xarajatlar.csv"
        pageSize={20}
      />

      <Sheet open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{mode === "create" ? "Yangi takroriy xarajat" : "Tahrirlash"}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 py-2">
            {/* Entity */}
            <div className="flex flex-col gap-1.5">
              <Label>Sub&apos;ekt</Label>
              <Select value={form.entityId} onValueChange={(v) => setField("entityId", v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang…" />
                </SelectTrigger>
                <SelectContent>
                  {refs.entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div className="flex flex-col gap-1.5">
              <Label>Nomi</Label>
              <Input
                value={form.label}
                onChange={(e) => setField("label", e.target.value)}
                placeholder="Masalan: Ofis ijarasi"
              />
            </div>

            {/* Amount + Currency */}
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Summa</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0"
                  min={0}
                />
              </div>
              <div className="flex flex-col gap-1.5" style={{ minWidth: 90 }}>
                <Label>Valyuta</Label>
                <Select value={form.currency} onValueChange={(v) => setField("currency", v ?? "UZS")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rate (shown only for non-UZS) */}
            {form.currency !== "UZS" && (
              <div className="flex flex-col gap-1.5">
                <Label>UZS kursi (1 {form.currency} = ? UZS)</Label>
                <Input
                  type="number"
                  value={form.rate}
                  onChange={(e) => setField("rate", e.target.value)}
                  min={0}
                  step={0.0001}
                />
              </div>
            )}

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Kategoriya</Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v ?? "BOSHQA")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scope */}
            <div className="flex flex-col gap-1.5">
              <Label>Tur</Label>
              <Select value={form.scope} onValueChange={(v) => setField("scope", v ?? "FIXED")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day of month */}
            <div className="flex flex-col gap-1.5">
              <Label>Oy kuni (1–28)</Label>
              <Input
                type="number"
                value={form.dayOfMonth}
                onChange={(e) => setField("dayOfMonth", e.target.value)}
                min={1}
                max={28}
              />
            </div>

            {/* Start / End month */}
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Boshlanish (YYYY-MM)</Label>
                <Input
                  value={form.startMonth}
                  onChange={(e) => setField("startMonth", e.target.value)}
                  placeholder="2026-01"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Tugash (ixtiyoriy)</Label>
                <Input
                  value={form.endMonth}
                  onChange={(e) => setField("endMonth", e.target.value)}
                  placeholder="2026-12"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                Bekor qilish
              </Button>
              <Button onClick={submit} disabled={pending}>
                <Plus className="size-4" /> Saqlash
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
