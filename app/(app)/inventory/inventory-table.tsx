"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { AbcClass, ProductFormat, WarehouseType } from "@prisma/client";
import { ArrowLeftRight, PackageCheck, Undo2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatUZS } from "@/lib/format";
import { adjustStockAction, transferStockAction, returnStockAction } from "./actions";

export type SkuRowView = {
  productId: string;
  sku: string | null;
  workTitle: string;
  format: ProductFormat;
  abcClass: AbcClass | null;
  qtyOnHand: number;
  qtyReserved: number;
  available: number;
  onOrder: number;
  unitCost: number;
  rop: number;
  ss: number;
  suggestQty: number;
  isManualRop: boolean;
  status: string;
  omborda: number;
  agentda: number;
  sotilgan: number;
  qaytgan: number;
  warehouses: { id: string; name: string; type: WarehouseType; qtyOnHand: number }[];
};

type WarehouseOption = { id: string; name: string; type: WarehouseType };

const STATUS_META: Record<string, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  HEALTHY: { label: "Yetarli", tone: "success" },
  BELOW_ROP: { label: "ROP dan past", tone: "warning" },
  DEAD: { label: "Oʻlik zaxira", tone: "danger" },
  OUT_OF_STOCK: { label: "Tugagan", tone: "muted" },
};

type Mode = "transfer" | "adjust" | "return";

export function InventoryTable({
  rows,
  warehouses,
  canWrite,
  canAdjust,
}: {
  rows: SkuRowView[];
  warehouses: WarehouseOption[];
  canWrite: boolean;
  canAdjust: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [row, setRow] = React.useState<SkuRowView | null>(null);

  const [fromWh, setFromWh] = React.useState("");
  const [toWh, setToWh] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [condition, setCondition] = React.useState<"SELLABLE" | "DAMAGED">("SELLABLE");

  const open = React.useCallback(
    (m: Mode, r: SkuRowView) => {
      setMode(m);
      setRow(r);
      setFromWh(r.warehouses.find((w) => w.qtyOnHand > 0)?.id ?? warehouses[0]?.id ?? "");
      setToWh(warehouses.find((w) => w.type === "AGENT")?.id ?? warehouses[0]?.id ?? "");
      setQty("");
      setDelta("");
      setReason("");
      setCondition("SELLABLE");
    },
    [warehouses],
  );

  function close() {
    setMode(null);
    setRow(null);
  }

  function submit() {
    if (!row || !mode) return;
    startTransition(async () => {
      try {
        if (mode === "transfer") {
          await transferStockAction({
            productId: row.productId,
            fromWarehouseId: fromWh,
            toWarehouseId: toWh,
            qty: Number(qty),
            reason,
          });
          toast.success("Transfer bajarildi — tannarx nusxalar bilan koʻchdi");
        } else if (mode === "adjust") {
          await adjustStockAction({
            productId: row.productId,
            warehouseId: fromWh,
            delta: Number(delta),
            reason,
          });
          toast.success("Tuzatish yozildi");
        } else {
          await returnStockAction({
            productId: row.productId,
            warehouseId: fromWh,
            qty: Number(qty),
            condition,
            reason: reason || undefined,
          });
          toast.success(
            condition === "SELLABLE" ? "Qaytish zaxiraga qoʻshildi" : "Nuqsonli qaytish qayd etildi",
          );
        }
        close();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<SkuRowView>[]>(
    () => [
      {
        accessorKey: "workTitle",
        header: "Asar / SKU",
        cell: ({ row: r }) => (
          <div className="flex flex-col">
            <span className="font-medium">{r.original.workTitle}</span>
            <span className="text-xs text-muted-foreground">
              {r.original.sku ?? "—"} · {r.original.format}
              {r.original.abcClass ? ` · ${r.original.abcClass}` : ""}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "qtyOnHand",
        header: "QoH",
        cell: ({ row: r }) => <span className="tabular-nums">{formatNumber(r.original.qtyOnHand)}</span>,
      },
      {
        accessorKey: "qtyReserved",
        header: "Band",
        cell: ({ row: r }) => <span className="tabular-nums">{formatNumber(r.original.qtyReserved)}</span>,
      },
      {
        accessorKey: "available",
        header: "Mavjud",
        cell: ({ row: r }) => (
          <span className="flex items-center gap-1 tabular-nums font-medium">
            {formatNumber(r.original.available)}
            <InfoHint>Mavjud = QoH − Band = {r.original.qtyOnHand} − {r.original.qtyReserved}</InfoHint>
          </span>
        ),
      },
      {
        accessorKey: "onOrder",
        header: "Yoʻlda",
        cell: ({ row: r }) => <span className="tabular-nums">{formatNumber(r.original.onOrder)}</span>,
      },
      {
        accessorKey: "rop",
        header: "ROP",
        cell: ({ row: r }) => (
          <span className="flex items-center gap-1 tabular-nums">
            {formatNumber(r.original.rop)}
            <InfoHint>
              {r.original.isManualRop
                ? "Qoʻlda belgilangan ROP (reorder_rules.manualROP)"
                : `ROP = dAvg×L + SS · SS = ${formatNumber(r.original.ss)}`}
              {r.original.suggestQty > 0 && ` · EOQ tavsiya: ${formatNumber(r.original.suggestQty)} dona`}
            </InfoHint>
          </span>
        ),
      },
      {
        accessorKey: "unitCost",
        header: "Birlik narx",
        cell: ({ row: r }) => (
          <span className="flex items-center gap-1 tabular-nums">
            {formatUZS(r.original.unitCost)}
            <InfoHint>
              FIFO qatlamlarining ogʻirlangan oʻrtachasi — FAQAT bosma. Unikal ulush M12 (daily_unit_cost) da
              qoʻshiladi, shuning uchun ikki marta sanalmaydi.
            </InfoHint>
          </span>
        ),
      },
      {
        id: "To'rt holat",
        header: "Toʻrt holat",
        cell: ({ row: r }) => (
          <div className="flex flex-col text-xs tabular-nums text-muted-foreground">
            <span>Omborda {formatNumber(r.original.omborda)} · Agentda {formatNumber(r.original.agentda)}</span>
            <span>Sotilgan {formatNumber(r.original.sotilgan)} · Qaytgan {formatNumber(r.original.qaytgan)}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Holat",
        cell: ({ row: r }) => {
          const m = STATUS_META[r.original.status] ?? { label: r.original.status, tone: "muted" as const };
          return <StatusBadge status={r.original.status} tone={m.tone} label={m.label} />;
        },
      },
      {
        id: "Amallar",
        header: "",
        cell: ({ row: r }) => (
          <div className="flex justify-end gap-1">
            {canWrite && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => open("transfer", r.original)}
                  title="Transfer / agentga berish"
                >
                  <ArrowLeftRight className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => open("return", r.original)} title="Qaytish">
                  <Undo2 className="size-4" />
                </Button>
              </>
            )}
            {canAdjust && (
              <Button variant="ghost" size="sm" onClick={() => open("adjust", r.original)} title="Tuzatish">
                <PackageCheck className="size-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canWrite, canAdjust, open],
  );

  const title =
    mode === "transfer" ? "Transfer / konsignatsiya" : mode === "adjust" ? "Zaxira tuzatishi" : "Qaytish";

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Asar yoki SKU qidirish…"
        csvFileName="ombor.csv"
        pageSize={15}
      />

      <Sheet open={mode !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-2">
            {row && <p className="text-sm text-muted-foreground">{row.workTitle}</p>}

            <div className="flex flex-col gap-1.5">
              <Label>{mode === "transfer" ? "Chiqish ombori" : "Ombor"}</Label>
              <Select value={fromWh} onValueChange={(v) => setFromWh(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(row?.warehouses.length ? row.warehouses : warehouses).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {"qtyOnHand" in w ? ` (${w.qtyOnHand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "transfer" && (
              <div className="flex flex-col gap-1.5">
                <Label>Kirish ombori</Label>
                <Select value={toWh} onValueChange={(v) => setToWh(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} {w.type === "AGENT" ? "· konsignatsiya" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Transfer sotuv emas — tannarx nusxalar bilan koʻchadi va «Sotilgan» raqamiga tegmaydi.
                </p>
              </div>
            )}

            {mode === "return" && (
              <div className="flex flex-col gap-1.5">
                <Label>Holati</Label>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition((v as "SELLABLE" | "DAMAGED") ?? "SELLABLE")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SELLABLE">Sotiladigan — zaxiraga qaytadi</SelectItem>
                    <SelectItem value="DAMAGED">Shikastlangan — zaxiraga qaytmaydi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "adjust" ? (
              <div className="flex flex-col gap-1.5">
                <Label>Tuzatish (+/−)</Label>
                <Input
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  inputMode="numeric"
                  placeholder="masalan -30"
                />
                <p className="text-xs text-muted-foreground">
                  Musbat tuzatish joriy ogʻirlangan oʻrtacha narxda qatlam ochadi; manfiy tuzatish FIFO
                  boʻyicha yechadi. Ikkisi ham sotuv emas.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Miqdor</Label>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Sabab {mode === "return" ? "(ixtiyoriy)" : ""}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={close} disabled={pending}>
                Bekor qilish
              </Button>
              <Button onClick={submit} disabled={pending}>
                Saqlash
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
