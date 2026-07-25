"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleDollarSign, RefreshCw } from "lucide-react";
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
import { registerPaymentAction, runArOverdueAction } from "../actions";

export type ReceivableView = {
  id: string;
  orderId: string;
  who: string;
  entityName: string;
  amountUZS: number;
  paidUZS: number;
  outstandingUZS: number;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgingBucket;
  status: string;
};

const BUCKET_TONE: Record<AgingBucket, "muted" | "info" | "warning" | "danger"> = {
  CURRENT: "muted",
  D0_30: "info",
  D31_60: "warning",
  D61_90: "warning",
  D90_PLUS: "danger",
};

export function ReceivablesClient({
  rows,
  canPay,
  canAdmin,
}: {
  rows: ReceivableView[];
  canPay: boolean;
  canAdmin: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<ReceivableView | null>(null);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"CASH" | "CARD" | "BANK">("BANK");

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

  const columns = React.useMemo<ColumnDef<ReceivableView>[]>(
    () => [
      {
        accessorKey: "who",
        header: "Mijoz",
        cell: ({ row }) => (
          <Link href={`/sales/orders/${row.original.orderId}`} className="font-medium hover:underline">
            {row.original.who}
          </Link>
        ),
      },
      { accessorKey: "entityName", header: "Sub'ekt" },
      {
        accessorKey: "amountUZS",
        header: "Summa",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.amountUZS)}</span>,
      },
      {
        accessorKey: "paidUZS",
        header: "Toʻlangan",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.paidUZS)}</span>,
      },
      {
        accessorKey: "outstandingUZS",
        header: "Qoldiq",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{formatUZS(row.original.outstandingUZS)}</span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: "Muddat",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dueDate ? formatDate(row.original.dueDate) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "daysOverdue",
        header: "Kechikish",
        cell: ({ row }) => (
          <span
            className={cn("tabular-nums", row.original.daysOverdue > 90 && "font-medium text-destructive")}
          >
            {row.original.daysOverdue > 0 ? `${row.original.daysOverdue} kun` : "—"}
          </span>
        ),
      },
      {
        accessorKey: "bucket",
        header: "Guruh",
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.bucket}
            tone={BUCKET_TONE[row.original.bucket]}
            label={AGING_LABELS[row.original.bucket]}
          />
        ),
      },
      {
        id: "Amallar",
        header: "",
        cell: ({ row }) =>
          canPay ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTarget(row.original);
                  setAmount(String(row.original.outstandingUZS));
                  setMethod("BANK");
                }}
              >
                <CircleDollarSign className="size-4" /> Toʻlov
              </Button>
            </div>
          ) : null,
      },
    ],
    [canPay],
  );

  return (
    <>
      {canAdmin && (
        <div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = (await runArOverdueAction()) as { alerts: number };
                toast.success(`AV skaneri: ${r.alerts} bildirishnoma`);
              }, "Skaner ishga tushdi")
            }
          >
            <RefreshCw className="size-4" /> Muddat skaneri
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Mijoz yoki sub'ekt…"
        csvFileName="qarzlar.csv"
        pageSize={15}
      />

      <Sheet open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Toʻlov qabul qilish</SheetTitle>
          </SheetHeader>
          {target && (
            <div className="flex flex-col gap-4 px-4 py-2">
              <p className="text-sm text-muted-foreground">
                {target.who} · qoldiq {formatUZS(target.outstandingUZS)}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label>Summa</Label>
                <Input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Usul</Label>
                <Select value={method} onValueChange={(v) => setMethod((v as "CASH" | "CARD" | "BANK") ?? "BANK")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="CARD">Karta</SelectItem>
                    <SelectItem value="CASH">Naqd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>
                  Bekor qilish
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => {
                    const t = target;
                    setTarget(null);
                    run(
                      () =>
                        registerPaymentAction({
                          receivableId: t.id,
                          amountUZS: Number(amount),
                          method,
                        }),
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
