"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ProductFormat, SalesChannelType, SalesOrderStatus } from "@prisma/client";
import { Check, CircleDollarSign, PackageCheck, Receipt, Truck, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  cancelOrderAction,
  confirmOrderAction,
  createReturnAction,
  invoiceOrderAction,
  registerPaymentAction,
  shipOrderAction,
} from "../../actions";

export type OrderCardLine = {
  id: string;
  workTitle: string;
  sku: string | null;
  format: ProductFormat;
  qty: number;
  returnedQty: number;
  unitPrice: number;
  discountRate: number;
  netUnit: number;
  channelFeeUnit: number;
  cogsUnit: number | null;
  cmUnit: number | null;
  deliveryCostUnit: number;
  sealed: boolean;
};

/** The happy path, in order. CANCELLED sits outside the stepper. */
const STEPS: { status: SalesOrderStatus; label: string }[] = [
  { status: "DRAFT", label: "Qoralama" },
  { status: "CONFIRMED", label: "Tasdiqlangan" },
  { status: "SHIPPED", label: "Joʻnatilgan" },
  { status: "INVOICED", label: "Hisob-faktura" },
  { status: "PAID", label: "Toʻlangan" },
];

export function OrderCard({
  orderId,
  status,
  channelType,
  channelFeeRate,
  lines,
  totals,
  receivable,
  dates,
  canWrite,
  canPay,
}: {
  orderId: string;
  status: SalesOrderStatus;
  channelType: SalesChannelType;
  channelFeeRate: number;
  lines: OrderCardLine[];
  totals: { gross: number; net: number; cm: number; cogs: number; units: number; cmRate: number };
  receivable: { id: string; amountUZS: number; paidUZS: number; status: string; dueDate: string | null } | null;
  dates: { orderDate: string; shippedDate: string | null; invoicedDate: string | null; paidDate: string | null };
  canWrite: boolean;
  canPay: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [returnFor, setReturnFor] = React.useState<OrderCardLine | null>(null);
  const [retQty, setRetQty] = React.useState("");
  const [retCondition, setRetCondition] = React.useState<"SELLABLE" | "DAMAGED">("SELLABLE");
  const [payOpen, setPayOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<"CASH" | "CARD" | "BANK">("BANK");

  const currentStep = STEPS.findIndex((s) => s.status === status);
  const cancelled = status === "CANCELLED";
  const anySealed = lines.some((l) => l.sealed);

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

  const outstanding = receivable ? receivable.amountUZS - receivable.paidUZS : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Status stepper ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        {cancelled ? (
          <StatusBadge status="CANCELLED" />
        ) : (
          STEPS.map((s, i) => (
            <React.Fragment key={s.status}>
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-sm",
                  i < currentStep && "text-muted-foreground",
                  i === currentStep && "bg-primary/10 font-medium text-primary",
                  i > currentStep && "text-muted-foreground/50",
                )}
              >
                {s.label}
              </span>
            </React.Fragment>
          ))
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {canWrite && status === "DRAFT" && (
            <Button disabled={pending} onClick={() => run(() => confirmOrderAction(orderId), "Tasdiqlandi — zaxira band qilindi")}>
              <Check className="size-4" /> Tasdiqlash
            </Button>
          )}
          {canWrite && status === "CONFIRMED" && (
            <Button disabled={pending} onClick={() => run(() => shipOrderAction(orderId), "Joʻnatildi — tannarx va marja muhrlandi")}>
              <Truck className="size-4" /> Joʻnatish
            </Button>
          )}
          {canWrite && status === "SHIPPED" && (
            <Button disabled={pending} onClick={() => run(() => invoiceOrderAction(orderId), "Hisob-faktura — qarz ochildi")}>
              <Receipt className="size-4" /> Hisob-faktura
            </Button>
          )}
          {canPay && status === "INVOICED" && receivable && (
            <Button disabled={pending} onClick={() => { setPayAmount(String(outstanding)); setPayOpen(true); }}>
              <CircleDollarSign className="size-4" /> Toʻlov qabul qilish
            </Button>
          )}
          {canWrite && (status === "DRAFT" || status === "CONFIRMED") && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => cancelOrderAction(orderId), "Bekor qilindi — band yechildi")}
            >
              <X className="size-4" /> Bekor qilish
            </Button>
          )}
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Nusxa" value={formatNumber(totals.units)} hint={`Buyurtma ${formatDate(dates.orderDate)}`} />
        <KpiCard
          title={channelType === "MARKETPLACE" ? "Sof tushum (marketpleys KPI)" : "Sof tushum"}
          value={formatUZS(totals.net)}
          hint={
            <span className="inline-flex items-center gap-1">
              asosiy {formatUZS(totals.gross)}
              <InfoHint>
                Sof = asosiy × (1 − chegirma) − kanal komissiyasi ({(channelFeeRate * 100).toFixed(0)}%).
                {channelType === "MARKETPLACE" && " Marketpleys faqat SOF bo'yicha baholanadi."}
              </InfoHint>
            </span>
          }
        />
        <KpiCard
          title="Tannarx (FIFO)"
          value={anySealed ? formatUZS(totals.cogs) : "—"}
          hint={anySealed ? "Joʻnatishda muhrlangan" : "Joʻnatishdan keyin muhrlanadi"}
        />
        <KpiCard
          title="Marja (CM)"
          value={anySealed ? formatUZS(totals.cm) : "—"}
          hint={
            anySealed ? (
              <span className="inline-flex items-center gap-1">
                {(totals.cmRate * 100).toFixed(1)}% sofdan
                <InfoHint>CM = sof − tannarx − royalti bahosi − yetkazish. Joʻnatishda muhrlanadi.</InfoHint>
              </span>
            ) : (
              "Joʻnatishdan keyin"
            )
          }
        />
      </div>

      {/* ── Lines ──────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asar / SKU</TableHead>
              <TableHead className="text-right">Miqdor</TableHead>
              <TableHead className="text-right">Asosiy narx</TableHead>
              <TableHead className="text-right">Chegirma</TableHead>
              <TableHead className="text-right">Sof/dona</TableHead>
              <TableHead className="text-right">Tannarx/dona</TableHead>
              <TableHead className="text-right">CM/dona</TableHead>
              <TableHead className="text-right">Qaytgan</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{l.workTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.sku ?? "—"} · {l.format}
                      {l.deliveryCostUnit > 0 && ` · yetkazish ${formatUZS(l.deliveryCostUnit)}/dona`}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(l.qty)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(l.unitPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(l.discountRate * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {formatUZS(l.netUnit)}
                    {l.channelFeeUnit > 0 && (
                      <InfoHint>Kanal komissiyasi {formatUZS(l.channelFeeUnit)}/dona olib tashlangan</InfoHint>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.cogsUnit != null ? formatUZS(l.cogsUnit) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {l.cmUnit != null ? (
                    <span className={cn(l.cmUnit < 0 && "text-destructive")}>{formatUZS(l.cmUnit)}</span>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">muhrlanmagan</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.returnedQty > 0 ? formatNumber(l.returnedQty) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && l.sealed && l.returnedQty < l.qty && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReturnFor(l);
                        setRetQty(String(l.qty - l.returnedQty));
                        setRetCondition("SELLABLE");
                      }}
                    >
                      <Undo2 className="size-4" /> Qaytish
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── AR ─────────────────────────────────────────────────────────────── */}
      {receivable && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3 text-sm">
          <span className="font-medium">Qarz</span>
          <StatusBadge status={receivable.status} />
          <span className="tabular-nums">
            {formatUZS(receivable.amountUZS)} · toʻlangan {formatUZS(receivable.paidUZS)} · qoldiq{" "}
            <strong>{formatUZS(outstanding)}</strong>
          </span>
          {receivable.dueDate && (
            <span className="text-muted-foreground">Muddat {formatDate(receivable.dueDate)}</span>
          )}
        </div>
      )}

      {/* ── Return sheet ───────────────────────────────────────────────────── */}
      <Sheet open={returnFor !== null} onOpenChange={(o) => !o && setReturnFor(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Qaytishni qayd etish</SheetTitle>
          </SheetHeader>
          {returnFor && (
            <div className="flex flex-col gap-4 px-4 py-2">
              <p className="text-sm text-muted-foreground">
                {returnFor.workTitle} · joʻnatilgan {formatNumber(returnFor.qty)}, allaqachon qaytgan{" "}
                {formatNumber(returnFor.returnedQty)}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label>Miqdor</Label>
                <Input value={retQty} inputMode="numeric" onChange={(e) => setRetQty(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Holati</Label>
                <Select
                  value={retCondition}
                  onValueChange={(v) => setRetCondition((v as "SELLABLE" | "DAMAGED") ?? "SELLABLE")}
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
              <p className="text-xs text-muted-foreground">
                Qaytish davr sof sotuvini kamaytiradi — royalti va kanal KPI ayni shu sof raqamni oʻqiydi.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReturnFor(null)} disabled={pending}>
                  Bekor qilish
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => {
                    const line = returnFor;
                    setReturnFor(null);
                    run(
                      () =>
                        createReturnAction({
                          orderLineId: line.id,
                          qty: Number(retQty),
                          condition: retCondition,
                        }),
                      "Qaytish qayd etildi",
                    );
                  }}
                >
                  <PackageCheck className="size-4" /> Saqlash
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Payment sheet ──────────────────────────────────────────────────── */}
      <Sheet open={payOpen} onOpenChange={setPayOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Toʻlov qabul qilish</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-2">
            <p className="text-sm text-muted-foreground">Qoldiq {formatUZS(outstanding)}</p>
            <div className="flex flex-col gap-1.5">
              <Label>Summa</Label>
              <Input value={payAmount} inputMode="numeric" onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Usul</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod((v as "CASH" | "CARD" | "BANK") ?? "BANK")}
              >
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
            <p className="text-xs text-muted-foreground">
              Qisman toʻlov normal — qarz faqat toʻliq qoplanganda yopiladi va buyurtma TOʻLANGAN holatiga
              oʻtadi.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayOpen(false)} disabled={pending}>
                Bekor qilish
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  setPayOpen(false);
                  run(
                    () =>
                      registerPaymentAction({
                        receivableId: receivable!.id,
                        amountUZS: Number(payAmount),
                        method: payMethod,
                      }),
                    "Toʻlov qayd etildi",
                  );
                }}
              >
                Saqlash
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
