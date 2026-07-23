"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { PrintOrderStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { MoneyText } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { formatNumber } from "@/lib/format";
import {
  createPrintOrderAction,
  transitionPrintOrderAction,
  receivePrintOrderAction,
} from "../actions";

export type OrderRow = {
  id: string;
  title: string;
  editionNo: number | null;
  printer: string;
  qty: number;
  currency: string;
  unitPPB: number;
  rate: number;
  unitUZS: number;
  status: PrintOrderStatus;
  receivedQty: number | null;
};
export type EditionOpt = { id: string; label: string; products: { id: string; format: string }[] };
type Opt = { id: string; name: string; currency?: string };

const NEXT: Record<PrintOrderStatus, PrintOrderStatus | null> = {
  REQUESTED: "APPROVED",
  APPROVED: "PRINTING",
  PRINTING: null, // received via the receive form
  RECEIVED: null,
};
const NEXT_LABEL: Record<string, string> = { APPROVED: "Tasdiqlash", PRINTING: "Bosishga" };

export function PrintOrdersClient({
  orders,
  editions,
  printers,
  warehouses,
  canWrite,
}: {
  orders: OrderRow[];
  editions: EditionOpt[];
  printers: Opt[];
  warehouses: Opt[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [showAdd, setShowAdd] = React.useState(false);

  const [editionId, setEditionId] = React.useState(editions[0]?.id ?? "");
  const edition = editions.find((e) => e.id === editionId);
  const [productId, setProductId] = React.useState(edition?.products[0]?.id ?? "");
  const [printerId, setPrinterId] = React.useState(printers[0]?.id ?? "");
  const [qty, setQty] = React.useState(3000);
  const [unitPPB, setUnitPPB] = React.useState(39480);
  const [currency, setCurrency] = React.useState(printers[0]?.currency ?? "UZS");
  const [rate, setRate] = React.useState(1);

  React.useEffect(() => {
    setProductId(edition?.products[0]?.id ?? "");
  }, [editionId, edition?.products]);

  const liveUZS = unitPPB * rate;

  function create() {
    if (!editionId || !productId || !printerId) {
      toast.error("Nashr, SKU va bosmaxona majburiy");
      return;
    }
    startTransition(async () => {
      try {
        await createPrintOrderAction({
          editionId,
          productId,
          printerId,
          quantity: qty,
          unitPPB,
          fixedCost: 0,
          currency,
          rate,
        });
        setShowAdd(false);
        toast.success("Print order yaratildi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function advance(o: OrderRow) {
    const to = NEXT[o.status];
    if (!to) return;
    startTransition(async () => {
      try {
        await transitionPrintOrderAction(o.id, to);
        toast.success("Holat yangilandi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Print orderlar</h1>
        {canWrite && (
          <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="size-4" /> Yangi order
          </Button>
        )}
      </div>

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Yangi print order (outsource bosmaxona)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Nashr (edition)">
              <Select value={editionId} onValueChange={(v) => setEditionId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="SKU">
              <Select value={productId} onValueChange={(v) => setProductId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(edition?.products ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.format}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Bosmaxona (PRINTER)">
              <Select
                value={printerId}
                onValueChange={(v) => {
                  setPrinterId(v ?? "");
                  const pr = printers.find((p) => p.id === v);
                  if (pr?.currency) setCurrency(pr.currency);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Adad">
              <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </Field>
            <Field label="Birlik narxi (valyutada)">
              <Input type="number" value={unitPPB} onChange={(e) => setUnitPPB(Number(e.target.value))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valyuta">
                <Select value={currency} onValueChange={(v) => setCurrency(v ?? "UZS")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["UZS", "USD", "TRY", "EUR"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Kurs → soʻm">
                <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
              </Field>
            </div>
            <div className="sm:col-span-3 flex items-center justify-between border-t pt-3">
              <div className="text-sm text-muted-foreground">
                Birlik (soʻm): <MoneyText value={liveUZS} className="font-medium text-foreground" />{" "}
                · Jami: <MoneyText value={liveUZS * qty} className="font-medium text-foreground" />
              </div>
              <Button onClick={create} disabled={pending}>
                Yaratish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asar / nashr</TableHead>
              <TableHead>Bosmaxona</TableHead>
              <TableHead>Adad</TableHead>
              <TableHead>Birlik (soʻm)</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead className="text-right">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  {o.title}
                  {o.editionNo ? ` · ${o.editionNo}-nashr` : ""}
                </TableCell>
                <TableCell>
                  {o.printer}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({o.currency} {formatNumber(o.unitPPB)} × {o.rate})
                  </span>
                </TableCell>
                <TableCell>
                  {formatNumber(o.qty)}
                  {o.receivedQty != null ? ` (qabul: ${formatNumber(o.receivedQty)})` : ""}
                </TableCell>
                <TableCell>
                  <MoneyText value={o.unitUZS} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && NEXT[o.status] && (
                    <Button size="xs" variant="outline" disabled={pending} onClick={() => advance(o)}>
                      {NEXT_LABEL[NEXT[o.status]!]}
                    </Button>
                  )}
                  {canWrite && o.status === "PRINTING" && (
                    <ReceiveForm order={o} warehouses={warehouses} pending={pending} startTransition={startTransition} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState description="Print orderlar yoʻq." />
      )}
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

function ReceiveForm({
  order,
  warehouses,
  pending,
  startTransition,
}: {
  order: OrderRow;
  warehouses: Opt[];
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [actualQty, setActualQty] = React.useState(order.qty);
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id ?? "");

  function receive() {
    if (!warehouseId) {
      toast.error("Ombor tanlang");
      return;
    }
    startTransition(async () => {
      try {
        await receivePrintOrderAction(order.id, actualQty, warehouseId);
        toast.success("Qabul qilindi — QoH oshdi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="mt-2 flex items-center justify-end gap-1.5">
      <Input
        type="number"
        value={actualQty}
        onChange={(e) => setActualQty(Number(e.target.value))}
        className="h-7 w-24 text-right"
      />
      <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="xs" disabled={pending} onClick={receive}>
        Qabul qilish
      </Button>
    </div>
  );
}
