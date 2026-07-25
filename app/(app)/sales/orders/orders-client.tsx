"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { SalesChannelType, SalesOrderStatus } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";
import { createSalesOrderAction, previewDiscountAction } from "../actions";

export type OrderRow = {
  id: string;
  status: SalesOrderStatus;
  channel: string;
  channelType: SalesChannelType;
  entity: string;
  customer: string;
  orderDate: string;
  units: number;
  gross: number;
  net: number;
  cm: number;
  sealed: boolean;
};

export type NewOrderRefs = {
  channels: { id: string; name: string; type: SalesChannelType; defaultDiscount: number; feeRate: number }[];
  entities: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  partners: { id: string; name: string; creditLimit: number | null; isBlocked: boolean }[];
  products: { id: string; sku: string | null; titleId: string; workTitle: string; listPrice: number }[];
};

type DraftLine = {
  productId: string;
  qty: string;
  /** Empty = let the rule engine decide (the normal path). */
  discountRate: string;
  deliveryCostUnit: string;
  preview?: { rate: number; source: string };
};

const NO_PARTNER = "__none__";

export function OrdersClient({
  rows,
  refs,
  canWrite,
  canOverride,
}: {
  rows: OrderRow[];
  refs: NewOrderRefs;
  canWrite: boolean;
  canOverride: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [channelId, setChannelId] = React.useState(refs.channels[0]?.id ?? "");
  const [entityId, setEntityId] = React.useState(refs.entities[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(refs.warehouses[0]?.id ?? "");
  const [partnerId, setPartnerId] = React.useState(NO_PARTNER);
  const [customerName, setCustomerName] = React.useState("");
  const [overridePMin, setOverridePMin] = React.useState(false);
  const [lines, setLines] = React.useState<DraftLine[]>([
    { productId: refs.products[0]?.id ?? "", qty: "1", discountRate: "", deliveryCostUnit: "" },
  ]);

  const channel = refs.channels.find((c) => c.id === channelId);
  const partner = refs.partners.find((p) => p.id === partnerId);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  /** Ask the server what the rule ladder would give — and WHERE it came from. */
  function refreshPreview(i: number) {
    const l = lines[i];
    const product = refs.products.find((p) => p.id === l.productId);
    if (!product || !l.qty) return;
    startTransition(async () => {
      try {
        const r = await previewDiscountAction({
          partnerId: partnerId === NO_PARTNER ? null : partnerId,
          titleId: product.titleId,
          entityId,
          qty: Number(l.qty),
          unitPrice: product.listPrice,
        });
        setLine(i, { preview: { rate: r.rate, source: r.source } });
      } catch {
        // A failed preview must never block typing — the server re-resolves on save.
      }
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        const id = await createSalesOrderAction({
          channelId,
          entityId,
          warehouseId,
          partnerId: partnerId === NO_PARTNER ? null : partnerId,
          customerName: customerName || null,
          overridePMin: overridePMin || undefined,
          lines: lines
            .filter((l) => l.productId && Number(l.qty) > 0)
            .map((l) => ({
              productId: l.productId,
              qty: Number(l.qty),
              discountRate: l.discountRate === "" ? undefined : Number(l.discountRate),
              deliveryCostUnit: l.deliveryCostUnit === "" ? undefined : Number(l.deliveryCostUnit),
            })),
        });
        toast.success("Buyurtma qoralama sifatida saqlandi");
        setOpen(false);
        window.location.href = `/sales/orders/${id}`;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<OrderRow>[]>(
    () => [
      {
        accessorKey: "orderDate",
        header: "Sana",
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.orderDate)}</span>,
      },
      {
        accessorKey: "customer",
        header: "Mijoz",
        cell: ({ row }) => (
          <Link href={`/sales/orders/${row.original.id}`} className="font-medium hover:underline">
            {row.original.customer}
          </Link>
        ),
      },
      { accessorKey: "channel", header: "Kanal" },
      { accessorKey: "entity", header: "Sub'ekt" },
      {
        accessorKey: "units",
        header: "Nusxa",
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.units)}</span>,
      },
      {
        accessorKey: "net",
        header: "Sof qiymat",
        cell: ({ row }) => (
          <span className="flex items-center gap-1 tabular-nums">
            {formatUZS(row.original.net)}
            <InfoHint>
              Sof = asosiy narx × (1 − chegirma) − kanal komissiyasi. Marketpleys KPI ayni shu sof raqamga
              qaraydi, aylanmaga emas.
            </InfoHint>
          </span>
        ),
      },
      {
        accessorKey: "cm",
        header: "Marja (CM)",
        cell: ({ row }) =>
          row.original.sealed ? (
            <span className="flex items-center gap-1 tabular-nums font-medium">
              {formatUZS(row.original.cm)}
              <InfoHint>Joʻnatishda muhrlangan: CM = sof − tannarx − royalti − yetkazish</InfoHint>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              muhrlanmagan
              <InfoHint>CM faqat joʻnatishda FIFO tannarxi bilan muhrlanadi.</InfoHint>
            </span>
          ),
      },
      {
        accessorKey: "status",
        header: "Holat",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <>
      {canWrite && (
        <div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Yangi buyurtma
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Mijoz, kanal yoki sub'ekt…"
        csvFileName="sotuv-buyurtmalari.csv"
        pageSize={15}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Yangi sotuv buyurtmasi</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Kanal</Label>
                <Select value={channelId} onValueChange={(v) => setChannelId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {channel && (
                  <p className="text-xs text-muted-foreground">
                    Standart chegirma {(channel.defaultDiscount * 100).toFixed(0)}% · komissiya{" "}
                    {(channel.feeRate * 100).toFixed(0)}%
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sub&apos;ekt (majburiy)</Label>
                <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ombor</Label>
                <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refs.warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Hamkor</Label>
                <Select value={partnerId} onValueChange={(v) => setPartnerId(v ?? NO_PARTNER)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARTNER}>— yoʻq (naqd mijoz) —</SelectItem>
                    {refs.partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.isBlocked ? " · bloklangan" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {partner?.creditLimit != null && (
                  <p className="text-xs text-muted-foreground">
                    Kredit limiti {formatUZS(partner.creditLimit)} — tasdiqlashda tekshiriladi
                  </p>
                )}
              </div>
            </div>

            {partnerId === NO_PARTNER && (
              <div className="flex flex-col gap-1.5">
                <Label>Mijoz nomi</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Qatorlar</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLines((ls) => [
                      ...ls,
                      { productId: refs.products[0]?.id ?? "", qty: "1", discountRate: "", deliveryCostUnit: "" },
                    ])
                  }
                >
                  <Plus className="size-4" /> Qator
                </Button>
              </div>

              {lines.map((l, i) => {
                const product = refs.products.find((p) => p.id === l.productId);
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Select
                          value={l.productId}
                          onValueChange={(v) => {
                            setLine(i, { productId: v ?? "" });
                            refreshPreview(i);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {refs.products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.workTitle} {p.sku ? `(${p.sku})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Miqdor</Label>
                        <Input
                          value={l.qty}
                          inputMode="numeric"
                          onChange={(e) => setLine(i, { qty: e.target.value })}
                          onBlur={() => refreshPreview(i)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Chegirma (bo&apos;sh = qoida)</Label>
                        <Input
                          value={l.discountRate}
                          inputMode="decimal"
                          placeholder={l.preview ? String(l.preview.rate) : "auto"}
                          onChange={(e) => setLine(i, { discountRate: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Yetkazish/dona</Label>
                        <Input
                          value={l.deliveryCostUnit}
                          inputMode="numeric"
                          onChange={(e) => setLine(i, { deliveryCostUnit: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {product ? `Asosiy narx ${formatUZS(product.listPrice)}` : "—"}
                      {l.preview &&
                        ` · qoida: ${(l.preview.rate * 100).toFixed(0)}% (${l.preview.source})`}
                    </p>
                  </div>
                );
              })}
            </div>

            {canOverride && (
              <label className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2.5 text-xs">
                <input
                  type="checkbox"
                  checked={overridePMin}
                  onChange={(e) => setOverridePMin(e.target.checked)}
                />
                <span className="text-destructive">
                  P_min blokini bekor qilish (admin) — audit jurnaliga va bildirishnomaga yoziladi
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
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
