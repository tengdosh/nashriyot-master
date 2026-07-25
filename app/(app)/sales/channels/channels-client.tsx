"use client";

import * as React from "react";
import { toast } from "sonner";
import type { SalesChannelType } from "@prisma/client";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateChannelAction } from "../actions";

export type ChannelCard = {
  id: string;
  name: string;
  type: SalesChannelType;
  defaultDiscount: number;
  feeRate: number;
  paymentTermDays: number;
  units: number;
  gross: number;
  net: number;
  cm: number;
  cmRate: number;
  headlineMetric: "NET" | "GROSS";
  months: { month: string; cm: number }[];
};

const TYPE_LABELS: Record<SalesChannelType, string> = {
  RETAIL: "Chakana",
  MARKETPLACE: "Marketpleys",
  DISTRIBUTOR: "Distributor",
  OWN_STORE: "Oʻz doʻkoni",
};

/** Inline CM bars — no chart library, just proportional divs. */
function CmBars({ months }: { months: { month: string; cm: number }[] }) {
  const max = Math.max(...months.map((m) => Math.abs(m.cm)), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 56 }}>
      {months.map((m) => {
        const h = Math.max((Math.abs(m.cm) / max) * 48, m.cm !== 0 ? 3 : 1);
        return (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn("w-full rounded-sm", m.cm < 0 ? "bg-destructive/60" : "bg-primary/70")}
              style={{ height: h }}
              title={`${m.month}: ${formatUZS(m.cm)}`}
            />
            <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChannelsClient({ cards, canWrite }: { cards: ChannelCard[]; canWrite: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [edit, setEdit] = React.useState<ChannelCard | null>(null);
  const [discount, setDiscount] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [term, setTerm] = React.useState("");

  function openEdit(c: ChannelCard) {
    setEdit(c);
    setDiscount(String(c.defaultDiscount));
    setFee(String(c.feeRate));
    setTerm(String(c.paymentTermDays));
  }

  function save() {
    if (!edit) return;
    const id = edit.id;
    setEdit(null);
    startTransition(async () => {
      try {
        await updateChannelAction({
          id,
          defaultDiscount: Number(discount),
          feeRate: Number(fee),
          paymentTermDays: Number(term),
        });
        toast.success("Kanal sozlamasi saqlandi — faqat yangi buyurtmalarga tushadi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{c.name}</CardTitle>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={c.type} tone="info" label={TYPE_LABELS[c.type]} />
                  {c.headlineMetric === "NET" && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      SOF boʻyicha baholanadi
                      <InfoHint>
                        Marketpleysda aylanma chalgʻituvchi — komissiya olib tashlangan SOF tushum asosiy
                        koʻrsatkich (v2 §6).
                      </InfoHint>
                    </span>
                  )}
                </div>
              </div>
              {canWrite && (
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                  <Pencil className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Standart chegirma</div>
                  <div className="tabular-nums">{(c.defaultDiscount * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Komissiya</div>
                  <div className="tabular-nums">{(c.feeRate * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Toʻlov muddati</div>
                  <div className="tabular-nums">{c.paymentTermDays} kun</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Nusxa</div>
                  <div className="tabular-nums">{formatNumber(c.units)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Asosiy</div>
                  <div className="tabular-nums">{formatUZS(c.gross)}</div>
                </div>
                <div>
                  <div className={cn("text-xs", c.headlineMetric === "NET" ? "font-medium text-primary" : "text-muted-foreground")}>
                    Sof
                  </div>
                  <div className="tabular-nums">{formatUZS(c.net)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">CM</div>
                  <div className="tabular-nums">
                    {formatUZS(c.cm)}
                    {c.net > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {(c.cmRate * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Oylik CM (muhrlangan, 6 oy)</div>
                <CmBars months={c.months} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Kanal sozlamasi</SheetTitle>
          </SheetHeader>
          {edit && (
            <div className="flex flex-col gap-4 px-4 py-2">
              <p className="text-sm text-muted-foreground">{edit.name}</p>
              <div className="flex flex-col gap-1.5">
                <Label>Standart chegirma (0–0.99)</Label>
                <Input value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Komissiya (0–0.99)</Label>
                <Input value={fee} inputMode="decimal" onChange={(e) => setFee(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Toʻlov muddati (kun)</Label>
                <Input value={term} inputMode="numeric" onChange={(e) => setTerm(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Bu oʻzgarish faqat yangi buyurtmalarga qoʻllanadi. Joʻnatilgan qatorlarning chegirmasi,
                tannarxi va marjasi muhrlangan — hech qachon qayta yozilmaydi.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEdit(null)} disabled={pending}>
                  Bekor qilish
                </Button>
                <Button onClick={save} disabled={pending}>
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
