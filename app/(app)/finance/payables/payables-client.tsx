"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleDollarSign, Plus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGING_LABELS, type AgingBucket } from "@/lib/sales";
import { formatDate, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createPayableAction, payPayableAction } from "../actions";

export type PayableView = {
  id: string;
  partnerName: string;
  type: string;
  currency: string;
  amount: number;
  amountUZS: number;
  paidUZS: number;
  outstandingUZS: number;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgingBucket;
  status: string;
};

export type PartnerOption = { id: string; name: string };
export type EntityOption = { id: string; name: string };

const BUCKET_TONE: Record<AgingBucket, "muted" | "info" | "warning" | "danger"> = {
  CURRENT: "muted",
  D0_30: "info",
  D31_60: "warning",
  D61_90: "warning",
  D90_PLUS: "danger",
};

const TYPE_LABELS: Record<string, string> = {
  PRINTING: "Bosma",
  COMMISSION_BOOKS: "Komissiya",
  RIGHTS: "Mualliflik huquqi",
  OTHER: "Boshqa",
};

type Method = "CASH" | "CARD" | "BANK";
type Currency = "UZS" | "USD" | "TRY" | "EUR";
type PayableType = "PRINTING" | "COMMISSION_BOOKS" | "RIGHTS" | "OTHER";

export function PayablesClient({
  rows,
  partners,
  entities,
  canWrite,
}: {
  rows: PayableView[];
  partners: PartnerOption[];
  entities: EntityOption[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  // create form
  const [createOpen, setCreateOpen] = React.useState(false);
  const [partnerId, setPartnerId] = React.useState("");
  const [type, setType] = React.useState<PayableType>("PRINTING");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>("UZS");
  const [rate, setRate] = React.useState("1");
  const [dueDate, setDueDate] = React.useState("");
  const [note, setNote] = React.useState("");

  // pay form
  const [target, setTarget] = React.useState<PayableView | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [entityId, setEntityId] = React.useState(entities[0]?.id ?? "");
  const [method, setMethod] = React.useState<Method>("BANK");

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

  const columns = React.useMemo<ColumnDef<PayableView>[]>(
    () => [
      { accessorKey: "partnerName", header: "Hamkor", cell: ({ row }) => <span className="font-medium">{row.original.partnerName}</span> },
      { accessorKey: "type", header: "Turi", cell: ({ row }) => TYPE_LABELS[row.original.type] ?? row.original.type },
      {
        accessorKey: "amount",
        header: "Summa",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.currency === "UZS"
              ? formatUZS(row.original.amountUZS)
              : `${row.original.amount.toLocaleString("ru-RU")} ${row.original.currency}`}
          </span>
        ),
      },
      { accessorKey: "amountUZS", header: "UZS", cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.amountUZS)}</span> },
      { accessorKey: "paidUZS", header: "Toʻlangan", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatUZS(row.original.paidUZS)}</span> },
      { accessorKey: "outstandingUZS", header: "Qoldiq", cell: ({ row }) => <span className="font-medium tabular-nums">{formatUZS(row.original.outstandingUZS)}</span> },
      {
        accessorKey: "dueDate",
        header: "Muddat",
        cell: ({ row }) => <span className="tabular-nums">{row.original.dueDate ? formatDate(row.original.dueDate) : "—"}</span>,
      },
      {
        accessorKey: "bucket",
        header: "Guruh",
        cell: ({ row }) => <StatusBadge status={row.original.bucket} tone={BUCKET_TONE[row.original.bucket]} label={AGING_LABELS[row.original.bucket]} />,
      },
      { accessorKey: "status", header: "Holat", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: "Amallar",
        header: "",
        cell: ({ row }) =>
          canWrite ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTarget(row.original);
                  setPayAmount(String(row.original.outstandingUZS));
                  setEntityId(entities[0]?.id ?? "");
                  setMethod("BANK");
                }}
              >
                <CircleDollarSign className="size-4" /> Toʻlov
              </Button>
            </div>
          ) : null,
      },
    ],
    [canWrite, entities],
  );

  function resetCreate() {
    setPartnerId("");
    setType("PRINTING");
    setAmount("");
    setCurrency("UZS");
    setRate("1");
    setDueDate("");
    setNote("");
  }

  return (
    <>
      {canWrite && (
        <div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Yangi majburiyat
          </Button>
        </div>
      )}

      <DataTable columns={columns} data={rows} searchPlaceholder="Hamkor…" csvFileName="majburiyatlar.csv" pageSize={15} />

      {/* Create */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Yangi majburiyat</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Hamkor</Label>
              <Select value={partnerId} onValueChange={(v) => setPartnerId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Turi</Label>
              <Select value={type} onValueChange={(v) => setType(v as PayableType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRINTING">Bosma</SelectItem>
                  <SelectItem value="COMMISSION_BOOKS">Komissiya</SelectItem>
                  <SelectItem value="RIGHTS">Mualliflik huquqi</SelectItem>
                  <SelectItem value="OTHER">Boshqa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Summa</Label>
                <Input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Valyuta</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UZS">UZS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {currency !== "UZS" && (
              <div className="flex flex-col gap-1.5">
                <Label>Kurs (1 {currency} = ? UZS)</Label>
                <Input value={rate} inputMode="numeric" onChange={(e) => setRate(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Toʻlov muddati</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Izoh</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>Bekor qilish</Button>
              <Button
                disabled={pending || !partnerId || !amount}
                onClick={() =>
                  run(async () => {
                    await createPayableAction({
                      partnerId,
                      type,
                      amount: Number(amount),
                      currency,
                      rate: Number(rate) || 1,
                      dueDate: dueDate || undefined,
                      note: note || undefined,
                    });
                    setCreateOpen(false);
                    resetCreate();
                  }, "Majburiyat qoʻshildi")
                }
              >
                Saqlash
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pay */}
      <Sheet open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Toʻlov qilish</SheetTitle>
          </SheetHeader>
          {target && (
            <div className="flex flex-col gap-4 px-4 py-2">
              <p className="text-sm text-muted-foreground">{target.partnerName} · qoldiq {formatUZS(target.outstandingUZS)}</p>
              <div className="flex flex-col gap-1.5">
                <Label>Summa (UZS)</Label>
                <Input value={payAmount} inputMode="numeric" onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Toʻlovchi sub&apos;ekt</Label>
                <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Usul</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="CARD">Karta</SelectItem>
                    <SelectItem value="CASH">Naqd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={cn("flex justify-end gap-2")}>
                <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>Bekor qilish</Button>
                <Button
                  disabled={pending || !entityId}
                  onClick={() => {
                    const t = target;
                    setTarget(null);
                    run(
                      () => payPayableAction({ payableId: t.id, amountUZS: Number(payAmount), entityId, method }),
                      "Toʻlov qayd etildi",
                    );
                  }}
                >
                  Saqlash
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
