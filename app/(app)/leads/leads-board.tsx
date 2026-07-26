"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadSource, LeadStatus, LostReason, SalesChannelType } from "@prisma/client";
import { Plus, MessageSquarePlus, ShoppingCart, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { createLeadAction, moveLeadAction, addNoteAction, convertLeadAction } from "./actions";

export type LeadCard = {
  id: string;
  source: LeadSource;
  campaign: string | null;
  contact: string;
  status: LeadStatus;
  interestTitle: string | null;
  interestTitleId: string | null;
  assignee: string | null;
  lostReason: LostReason | null;
  convertedOrderId: string | null;
  noteCount: number;
  staleness: "OK" | "WARN" | "STALE";
};

export type LeadRefs = {
  titles: { id: string; workTitle: string }[];
  channels: { id: string; name: string; type: SalesChannelType }[];
  entities: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  products: { id: string; sku: string | null; titleId: string; workTitle: string }[];
};

const COLUMNS: { key: LeadStatus; label: string }[] = [
  { key: "NEW", label: "Yangi" },
  { key: "CONTACTED", label: "Aloqada" },
  { key: "ORDERED", label: "Buyurtma" },
  { key: "LOST", label: "Yoʻqotildi" },
];
const SOURCES: LeadSource[] = ["INSTAGRAM", "TELEGRAM", "FACEBOOK", "REFERRAL", "WALK_IN", "OTHER"];
const LOST_REASONS: { v: LostReason; l: string }[] = [
  { v: "PRICE", l: "Narx" }, { v: "AVAILABILITY", l: "Mavjud emas" }, { v: "COMPETITOR", l: "Raqobatchi" },
  { v: "NO_RESPONSE", l: "Javob yoʻq" }, { v: "OTHER", l: "Boshqa" },
];
const STALE_DOT = { OK: "", WARN: "bg-warning", STALE: "bg-destructive" };

export function LeadsBoard({
  columns,
  refs,
  canWrite,
}: {
  columns: Record<LeadStatus, LeadCard[]>;
  refs: LeadRefs;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [addOpen, setAddOpen] = React.useState(false);
  const [card, setCard] = React.useState<LeadCard | null>(null);

  // quick-add
  const [source, setSource] = React.useState<LeadSource>("INSTAGRAM");
  const [campaign, setCampaign] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [interestTitleId, setInterestTitleId] = React.useState<string>("");

  // card actions
  const [note, setNote] = React.useState("");
  const [convertOpen, setConvertOpen] = React.useState(false);

  function run(fn: () => Promise<unknown>, ok: string, then?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        then?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function quickAdd() {
    run(
      () => createLeadAction({ source, campaign: campaign || null, contact, interestTitleId: interestTitleId || null }),
      "Lid qoʻshildi",
      () => { setAddOpen(false); setContact(""); setCampaign(""); },
    );
  }

  return (
    <>
      {canWrite && (
        <div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Tez lid qoʻshish
          </Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="flex items-center justify-between px-1 text-sm font-medium">
              <span>{col.label}</span>
              <span className="text-xs text-muted-foreground">{columns[col.key].length}</span>
            </div>
            {columns[col.key].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { setCard(l); setNote(""); setConvertOpen(false); }}
                className="flex flex-col gap-1 rounded-lg border bg-background p-2.5 text-left text-sm hover:bg-muted/40"
              >
                <div className="flex items-center gap-1.5">
                  {l.staleness !== "OK" && <span className={cn("size-2 rounded-full", STALE_DOT[l.staleness])} />}
                  <span className="font-medium">{l.contact}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {l.interestTitle ?? "—"}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <StatusBadge status={l.source} tone="muted" label={l.source} />
                  {l.campaign && <span className="truncate">· {l.campaign}</span>}
                </div>
                {l.status === "LOST" && l.lostReason && (
                  <span className="text-xs text-destructive">Sabab: {l.lostReason}</span>
                )}
              </button>
            ))}
            {columns[col.key].length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">boʻsh</p>}
          </div>
        ))}
      </div>

      {/* Quick add */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Tez lid qoʻshish</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-2">
            <div className="flex flex-col gap-1.5"><Label>Kontakt</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ism / telefon / @username" /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Manba</Label>
              <Select value={source} onValueChange={(v) => setSource((v as LeadSource) ?? "INSTAGRAM")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Kampaniya (ixtiyoriy)</Label><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Qiziqqan asar (ixtiyoriy)</Label>
              <Select value={interestTitleId} onValueChange={(v) => setInterestTitleId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{refs.titles.map((t) => <SelectItem key={t.id} value={t.id}>{t.workTitle}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={pending}>Bekor</Button>
              <Button onClick={quickAdd} disabled={pending || !contact.trim()}>Qoʻshish</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lead card */}
      <Sheet open={card !== null} onOpenChange={(o) => !o && setCard(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{card?.contact}</SheetTitle></SheetHeader>
          {card && (
            <div className="flex flex-col gap-4 px-4 py-2">
              <div className="text-sm text-muted-foreground">
                {card.source}{card.campaign && ` · ${card.campaign}`} · {card.interestTitle ?? "asar tanlanmagan"}
                <div className="mt-1"><StatusBadge status={card.status} /></div>
              </div>

              {canWrite && card.status !== "ORDERED" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Izoh qoʻshish</Label>
                    <div className="flex gap-2">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Suhbat izohi…" />
                      <Button
                        size="sm"
                        disabled={pending || !note.trim()}
                        onClick={() => run(() => addNoteAction({ leadId: card.id, text: note }), "Izoh qoʻshildi (→ Aloqada)", () => setNote(""))}
                      >
                        <MessageSquarePlus className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {card.status === "NEW" && (
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => moveLeadAction(card.id, "CONTACTED"), "Aloqada")}>
                        <ArrowRight className="size-4" /> Aloqaga oʻtkazish
                      </Button>
                    )}
                    <Button size="sm" disabled={pending} onClick={() => setConvertOpen(true)}>
                      <ShoppingCart className="size-4" /> Buyurtmaga aylantirish
                    </Button>
                    <LostButton disabled={pending} onLost={(reason) => run(() => moveLeadAction(card.id, "LOST", reason), "Yoʻqotildi", () => setCard(null))} />
                  </div>
                </>
              )}

              {card.status === "ORDERED" && card.convertedOrderId && (
                <a href={`/sales/orders/${card.convertedOrderId}`} className="text-sm text-primary hover:underline">
                  Buyurtmani koʻrish →
                </a>
              )}

              {convertOpen && card.status !== "ORDERED" && (
                <ConvertForm lead={card} refs={refs} pending={pending} onConvert={(payload) => run(() => convertLeadAction(payload), "Buyurtma yaratildi", () => { setConvertOpen(false); setCard(null); })} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function LostButton({ onLost, disabled }: { onLost: (r: LostReason) => void; disabled: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<LostReason>("PRICE");
  if (!open) return <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}><X className="size-4" /> Yoʻqotildi</Button>;
  return (
    <div className="flex items-center gap-1">
      <Select value={reason} onValueChange={(v) => setReason((v as LostReason) ?? "PRICE")}>
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onLost(reason)}>OK</Button>
    </div>
  );
}

function ConvertForm({
  lead,
  refs,
  pending,
  onConvert,
}: {
  lead: LeadCard;
  refs: LeadRefs;
  pending: boolean;
  onConvert: (payload: Record<string, unknown>) => void;
}) {
  const retail = refs.channels.find((c) => c.type === "RETAIL") ?? refs.channels[0];
  const preferred = lead.interestTitleId ? refs.products.find((p) => p.titleId === lead.interestTitleId) : undefined;
  const [productId, setProductId] = React.useState(preferred?.id ?? refs.products[0]?.id ?? "");
  const [qty, setQty] = React.useState("1");
  const [channelId, setChannelId] = React.useState(retail?.id ?? "");
  const [entityId, setEntityId] = React.useState(refs.entities[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(refs.warehouses[0]?.id ?? "");
  const [delivery, setDelivery] = React.useState("");

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="text-sm font-medium">Chakana buyurtma</div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Mahsulot</Label>
        <Select value={productId} onValueChange={(v) => setProductId(v ?? "")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{refs.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.workTitle} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1"><Label className="text-xs">Miqdor</Label><Input value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">Yetkazish/dona</Label><Input value={delivery} inputMode="numeric" onChange={(e) => setDelivery(e.target.value)} placeholder="0" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Kanal</Label>
          <Select value={channelId} onValueChange={(v) => setChannelId(v ?? "")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{refs.channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Sub&apos;ekt</Label>
          <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{refs.entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Ombor</Label>
        <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? "")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{refs.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button
        disabled={pending || !productId}
        onClick={() => onConvert({ leadId: lead.id, productId, qty: Number(qty), channelId, entityId, warehouseId, deliveryCostUnit: delivery ? Number(delivery) : undefined })}
      >
        Buyurtma yaratish
      </Button>
    </div>
  );
}
