"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { TransferOrderStatus } from "@prisma/client";
import { Plus, Trash2, Truck, PackageCheck, ChevronDown, ChevronRight } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";
import { transferPrice } from "@/lib/transfer";
import {
  createTransferAction,
  shipTransferAction,
  receiveTransferAction,
  previewTransferDiscountAction,
} from "./actions";

export type TransferLine = {
  workTitle: string;
  sku: string | null;
  qty: number;
  basePrice: number;
  discountRate: number;
  transferPrice: number;
};
export type TransferRow = {
  id: string;
  from: string;
  to: string;
  status: TransferOrderStatus;
  date: string;
  units: number;
  total: number;
  lines: TransferLine[];
};
export type TransferRefs = {
  entities: { id: string; name: string }[];
  warehouses: { id: string; name: string; entityId: string }[];
  products: { id: string; sku: string | null; titleId: string; workTitle: string; listPrice: number; entityId: string | null }[];
};

type Draft = { productId: string; qty: string; discountRate: string; preview?: { rate: number; source: string } };

export function TransfersClient({
  rows,
  refs,
  canWrite,
  canOverride,
}: {
  rows: TransferRow[];
  refs: TransferRefs;
  canWrite: boolean;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [fromEntityId, setFromEntityId] = React.useState(refs.entities[0]?.id ?? "");
  const [toEntityId, setToEntityId] = React.useState(refs.entities[1]?.id ?? refs.entities[0]?.id ?? "");
  const [fromWh, setFromWh] = React.useState("");
  const [toWh, setToWh] = React.useState("");
  const [overridePMin, setOverridePMin] = React.useState(false);
  const [lines, setLines] = React.useState<Draft[]>([{ productId: refs.products[0]?.id ?? "", qty: "1", discountRate: "" }]);

  const fromWarehouses = refs.warehouses.filter((w) => w.entityId === fromEntityId);
  const toWarehouses = refs.warehouses.filter((w) => w.entityId === toEntityId);

  React.useEffect(() => { setFromWh(fromWarehouses[0]?.id ?? ""); }, [fromEntityId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setToWh(toWarehouses[0]?.id ?? ""); }, [toEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setLine(i: number, patch: Partial<Draft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function refreshPreview(i: number) {
    const l = lines[i];
    const p = refs.products.find((x) => x.id === l.productId);
    if (!p || !l.qty) return;
    startTransition(async () => {
      try {
        const r = await previewTransferDiscountAction({ titleId: p.titleId, toEntityId, qty: Number(l.qty) });
        setLine(i, { preview: { rate: r.rate, source: r.source } });
      } catch {
        /* preview is advisory */
      }
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        const id = await createTransferAction({
          fromEntityId, toEntityId, fromWarehouseId: fromWh, toWarehouseId: toWh,
          overridePMin: overridePMin || undefined,
          lines: lines.filter((l) => l.productId && Number(l.qty) > 0).map((l) => ({
            productId: l.productId,
            qty: Number(l.qty),
            discountRate: l.discountRate === "" ? undefined : Number(l.discountRate),
          })),
        });
        toast.success("Transfer qoralama sifatida saqlandi");
        setOpen(false);
        router.refresh();
        void id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function act(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<TransferRow>[]>(
    () => [
      {
        id: "exp",
        header: "",
        cell: ({ row }) => (
          <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(row.original.id)) n.delete(row.original.id); else n.add(row.original.id); return n; })}>
            {expanded.has(row.original.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ),
      },
      { accessorKey: "date", header: "Sana", cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.date)}</span> },
      { accessorKey: "from", header: "Kimdan" },
      { accessorKey: "to", header: "Kimga" },
      { accessorKey: "units", header: "Nusxa", cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.units)}</span> },
      { accessorKey: "total", header: "Transfer summasi", cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.total)}</span> },
      { accessorKey: "status", header: "Holat", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: "act",
        header: "",
        cell: ({ row }) =>
          canWrite ? (
            <div className="flex justify-end gap-1">
              {row.original.status === "DRAFT" && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => shipTransferAction(row.original.id), "Joʻnatildi")}>
                  <Truck className="size-4" /> Joʻnatish
                </Button>
              )}
              {row.original.status === "SHIPPED" && (
                <ReceiveButton row={row.original} refs={refs} onReceive={(fw, tw) => act(() => receiveTransferAction(row.original.id, fw, tw), "Qabul qilindi")} pending={pending} />
              )}
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expanded, canWrite, pending, refs],
  );

  return (
    <>
      {canWrite && (
        <div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Yangi transfer
          </Button>
        </div>
      )}

      <DataTable columns={columns} data={rows} searchPlaceholder="Sub&apos;ekt qidirish…" csvFileName="transferlar.csv" pageSize={15} />

      {rows.filter((r) => expanded.has(r.id)).map((r) => (
        <div key={r.id} className="rounded-lg border p-3">
          <div className="mb-2 text-sm font-medium">{r.from} → {r.to} · {formatDate(r.date)}</div>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr><th className="p-1 text-left">Asar</th><th className="p-1 text-right">Miqdor</th><th className="p-1 text-right">Asosiy</th><th className="p-1 text-right">Chegirma</th><th className="p-1 text-right">Transfer narx</th></tr>
            </thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1">{l.workTitle} <span className="text-xs text-muted-foreground">{l.sku ?? ""}</span></td>
                  <td className="p-1 text-right tabular-nums">{formatNumber(l.qty)}</td>
                  <td className="p-1 text-right tabular-nums">{formatUZS(l.basePrice)}</td>
                  <td className="p-1 text-right tabular-nums">{(l.discountRate * 100).toFixed(0)}%</td>
                  <td className="p-1 text-right font-medium tabular-nums">{formatUZS(l.transferPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader><SheetTitle>Yangi transfer</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Kimdan (sub&apos;ekt)</Label>
                <Select value={fromEntityId} onValueChange={(v) => setFromEntityId(v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{refs.entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Kimga (sub&apos;ekt)</Label>
                <Select value={toEntityId} onValueChange={(v) => setToEntityId(v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{refs.entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Chiqish ombori</Label>
                <Select value={fromWh} onValueChange={(v) => setFromWh(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{fromWarehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Kirish ombori</Label>
                <Select value={toWh} onValueChange={(v) => setToWh(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{toWarehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Qatorlar</Label>
                <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { productId: refs.products[0]?.id ?? "", qty: "1", discountRate: "" }])}>
                  <Plus className="size-4" /> Qator
                </Button>
              </div>
              {lines.map((l, i) => {
                const p = refs.products.find((x) => x.id === l.productId);
                const disc = l.discountRate === "" ? (l.preview?.rate ?? 0) : Number(l.discountRate);
                const tp = p ? transferPrice(p.listPrice, Math.min(Math.max(disc, 0), 0.99)).toNumber() : 0;
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Select value={l.productId} onValueChange={(v) => { setLine(i, { productId: v ?? "" }); refreshPreview(i); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{refs.products.map((x) => <SelectItem key={x.id} value={x.id}>{x.workTitle} {x.sku ? `(${x.sku})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {lines.length > 1 && <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="flex flex-col gap-1"><Label className="text-xs">Miqdor</Label><Input value={l.qty} inputMode="numeric" onChange={(e) => setLine(i, { qty: e.target.value })} onBlur={() => refreshPreview(i)} /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs">Chegirma (bo&apos;sh=qoida)</Label><Input value={l.discountRate} inputMode="decimal" placeholder={l.preview ? String(l.preview.rate) : "auto"} onChange={(e) => setLine(i, { discountRate: e.target.value })} /></div>
                      <div className="flex flex-col gap-1"><Label className="text-xs">Transfer narx</Label><div className="pt-2 text-sm font-medium tabular-nums">{formatUZS(tp)}</div></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p ? `Asosiy narx ${formatUZS(p.listPrice)}` : "—"}
                      {l.preview && ` · qoida: ${(l.preview.rate * 100).toFixed(0)}% (${l.preview.source})`}
                    </p>
                  </div>
                );
              })}
            </div>

            {canOverride && (
              <label className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2.5 text-xs">
                <input type="checkbox" checked={overridePMin} onChange={(e) => setOverridePMin(e.target.checked)} />
                <span className="text-destructive">P_min blokini bekor qilish (admin) — auditga yoziladi</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Bekor qilish</Button>
              <Button onClick={submit} disabled={pending}>Saqlash</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ReceiveButton({
  row,
  refs,
  onReceive,
  pending,
}: {
  row: TransferRow;
  refs: TransferRefs;
  onReceive: (fromWh: string, toWh: string) => void;
  pending: boolean;
}) {
  // Resolve warehouses by entity name → id (MAIN/SALES of each side).
  const fromEnt = refs.entities.find((e) => e.name === row.from);
  const toEnt = refs.entities.find((e) => e.name === row.to);
  const fromWh = refs.warehouses.find((w) => w.entityId === fromEnt?.id)?.id ?? "";
  const toWh = refs.warehouses.find((w) => w.entityId === toEnt?.id)?.id ?? "";
  return (
    <Button variant="ghost" size="sm" disabled={pending || !fromWh || !toWh} onClick={() => onReceive(fromWh, toWh)}>
      <PackageCheck className="size-4" /> Qabul qilish
    </Button>
  );
}
