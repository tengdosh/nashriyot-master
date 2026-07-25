"use client";

import * as React from "react";
import { toast } from "sonner";
import type { DisposalAction, DeadStockStatus, ProductFormat, WriteDownStatus } from "@prisma/client";
import { Check, RefreshCw, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  approveWriteDownAction,
  createWriteDownAction,
  recalcAbcAction,
  rejectWriteDownAction,
  rescanDeadStockAction,
  saveDeadStockSettingsAction,
  startDisposalAction,
} from "../actions";

export type DeadStockRow = {
  productId: string;
  workTitle: string;
  sku: string | null;
  format: ProductFormat;
  listPrice: number;
  ageDays: number;
  qtyOnHand: number;
  unitCost: number;
  deadCost: number;
  carryingCost: number;
  opportunityCost: number;
  totalLoss: number;
  carryingRate: number;
  expectedROI: number;
  thresholdDays: number;
  status: DeadStockStatus;
  suggestedAction: DisposalAction | null;
  suggestedDiscount: number;
  scannedAt: string;
};

export type WriteDownRow = {
  id: string;
  workTitle: string;
  sku: string | null;
  qty: number;
  amountUZS: number;
  action: DisposalAction;
  reason: string;
  status: WriteDownStatus;
  createdBy: string;
  createdById: string;
  approvedBy: string | null;
  createdAt: string;
};

/** The six ladder steps in order, cheapest remedy first (spec v1 §5.4). */
const LADDER: { action: DisposalAction; label: string; blurb: string }[] = [
  { action: "PRICE_CUT", label: "1. Narx pasaytirish", blurb: "Yosh bosqichiga mos chegirma bilan sotuvga qaytarish" },
  { action: "BUNDLE", label: "2. Toʻplam", blurb: "Yaxshi sotilayotgan kitob bilan birga toʻplamda" },
  { action: "RETURN_TO_SUPPLIER", label: "3. Qaytarish", blurb: "Shartnoma ruxsat bersa — yetkazib beruvchiga" },
  { action: "WHOLESALE", label: "4. Ulgurji", blurb: "Distributorga chuqur chegirma bilan katta partiya" },
  { action: "DONATION", label: "5. Xayriya", blurb: "Kutubxona/maktabga — imij va soliq foydasi" },
  { action: "WRITE_OFF", label: "6. Hisobdan chiqarish", blurb: "Oxirgi chora — maker-checker tasdiqi bilan" },
];

const DS_STATUS: Record<DeadStockStatus, { label: string; tone: "warning" | "info" | "success" | "muted" }> = {
  OPEN: { label: "Aniqlangan", tone: "warning" },
  IN_PROGRESS: { label: "Tasarruf jarayonda", tone: "info" },
  RESOLVED: { label: "Hal qilingan", tone: "success" },
  WRITTEN_OFF: { label: "Hisobdan chiqarilgan", tone: "muted" },
};

const WD_STATUS: Record<WriteDownStatus, { label: string; tone: "warning" | "success" | "danger" | "muted" }> = {
  DRAFT: { label: "Qoralama", tone: "muted" },
  PENDING_APPROVAL: { label: "Tasdiq kutilmoqda", tone: "warning" },
  APPROVED: { label: "Tasdiqlangan", tone: "success" },
  REJECTED: { label: "Rad etilgan", tone: "danger" },
};

export function DeadStockClient({
  rows,
  writeDowns,
  warehouses,
  settings,
  copies,
  currentUserId,
  canWrite,
  canAdjust,
  canAdmin,
}: {
  rows: DeadStockRow[];
  writeDowns: WriteDownRow[];
  warehouses: { id: string; name: string }[];
  settings: { deadStockDays: number; carryingRate: number; expectedROI: number; minTurnover: number };
  copies: number;
  currentUserId: string;
  canWrite: boolean;
  canAdjust: boolean;
  canAdmin: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  // Settings panel
  const [threshold, setThreshold] = React.useState(String(settings.deadStockDays));
  const [carrying, setCarrying] = React.useState(String(settings.carryingRate));
  const [roi, setRoi] = React.useState(String(settings.expectedROI));

  // Disposal wizard
  const [wizard, setWizard] = React.useState<DeadStockRow | null>(null);
  const [step, setStep] = React.useState<DisposalAction>("PRICE_CUT");
  const [wh, setWh] = React.useState(warehouses[0]?.id ?? "");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");

  function openWizard(r: DeadStockRow) {
    setWizard(r);
    setStep(r.suggestedAction ?? "PRICE_CUT");
    setQty(String(r.qtyOnHand));
    setReason("");
    setWh(warehouses[0]?.id ?? "");
  }

  function run<T>(fn: () => Promise<T>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function submitStep() {
    if (!wizard) return;
    if (step === "WRITE_OFF") {
      run(
        () =>
          createWriteDownAction({
            productId: wizard.productId,
            warehouseId: wh,
            qty: Number(qty),
            action: step,
            reason,
          }),
        "Hisobdan chiqarish tasdiqqa yuborildi — zaxira hozircha tegilmadi",
      );
    } else {
      run(
        () => startDisposalAction(wizard.productId, step),
        "Tasarruf bosqichi belgilandi",
      );
    }
    setWizard(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Settings ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1.5">
          <Label>Chegara kunlar</Label>
          <Select value={threshold} onValueChange={(v) => setThreshold(v ?? "120")}>
            <SelectTrigger className="w-28" disabled={!canAdmin}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["90", "120", "180"].map((d) => (
                <SelectItem key={d} value={d}>
                  {d} kun
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Saqlash %</Label>
          <Input
            className="w-24"
            value={carrying}
            onChange={(e) => setCarrying(e.target.value)}
            disabled={!canAdmin}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Kutilgan ROI</Label>
          <Input className="w-24" value={roi} onChange={(e) => setRoi(e.target.value)} disabled={!canAdmin} />
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div className="mr-2 text-sm text-muted-foreground">
            {formatNumber(copies)} nusxa · {rows.length} SKU
          </div>
          {canAdmin && (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      saveDeadStockSettingsAction({
                        deadStockDays: Number(threshold),
                        carryingRate: Number(carrying),
                        expectedROI: Number(roi),
                        minTurnover: settings.minTurnover,
                      }),
                    "Sozlama saqlandi — keyingi skanerdan kuchga kiradi",
                  )
                }
              >
                Saqlash
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await recalcAbcAction();
                    await rescanDeadStockAction();
                  }, "Skaner ishga tushdi")
                }
              >
                <RefreshCw className="size-4" /> Qayta skanerlash
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Loss table ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asar / SKU</TableHead>
              <TableHead className="text-right">Yosh</TableHead>
              <TableHead className="text-right">Qoldiq</TableHead>
              <TableHead className="text-right">C_dead</TableHead>
              <TableHead className="text-right">C_carrying</TableHead>
              <TableHead className="text-right">C_opportunity</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  JAMI
                  <InfoHint>
                    Uchta komponentning yigʻindisi. Bayroqdagi stavkalar skaner vaqtida muhrlangan, shuning
                    uchun sozlamani keyin oʻzgartirish bu raqamni qayta yozmaydi.
                  </InfoHint>
                </span>
              </TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Tavsiya</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  Oʻlik zaxira yoʻq — skaner hech narsa belgilamadi.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.productId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.workTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.sku ?? "—"} · {r.format} · skaner {formatDate(r.scannedAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", r.ageDays >= 2 * r.thresholdDays && "text-destructive font-medium")}>
                  {r.ageDays} kun
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.qtyOnHand)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.deadCost)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.carryingCost)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.opportunityCost)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatUZS(r.totalLoss)}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} tone={DS_STATUS[r.status].tone} label={DS_STATUS[r.status].label} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {LADDER.find((l) => l.action === r.suggestedAction)?.label ?? "—"}
                  {r.suggestedDiscount > 0 && ` · −${(r.suggestedDiscount * 100).toFixed(0)}%`}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && (
                    <Button variant="outline" size="sm" onClick={() => openWizard(r)}>
                      <Wand2 className="size-4" /> Tasarruf
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Write-downs (maker-checker) ───────────────────────────────────── */}
      {writeDowns.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Hisobdan chiqarishlar</h2>
          <p className="text-sm text-muted-foreground">
            Maker-checker: hujjatni yaratgan foydalanuvchi uni tasdiqlay olmaydi. Zaxira faqat tasdiqda
            kamayadi va bu CHIQIM (sotuv) emas — TUZATISH sifatida yoziladi.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Asar / SKU</TableHead>
                  <TableHead className="text-right">Miqdor</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Sabab</TableHead>
                  <TableHead>Yaratdi</TableHead>
                  <TableHead>Tasdiqladi</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {writeDowns.map((w) => {
                  const isMaker = w.createdById === currentUserId;
                  const actionable = canAdjust && w.status === "PENDING_APPROVAL" && !isMaker;
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="tabular-nums">{formatDate(w.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{w.workTitle}</span>
                          <span className="text-xs text-muted-foreground">{w.sku ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(w.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUZS(w.amountUZS)}</TableCell>
                      <TableCell className="max-w-56 truncate text-xs text-muted-foreground">{w.reason}</TableCell>
                      <TableCell className="text-xs">{w.createdBy}</TableCell>
                      <TableCell className="text-xs">{w.approvedBy ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={w.status} tone={WD_STATUS[w.status].tone} label={WD_STATUS[w.status].label} />
                      </TableCell>
                      <TableCell className="text-right">
                        {w.status === "PENDING_APPROVAL" && isMaker && (
                          <span className="text-xs text-muted-foreground">Oʻzingiz tasdiqlay olmaysiz</span>
                        )}
                        {actionable && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => run(() => approveWriteDownAction(w.id), "Tasdiqlandi — zaxira kamaydi")}
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => rejectWriteDownAction(w.id, "Qayta koʻrib chiqish kerak"), "Rad etildi")
                              }
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Six-step disposal wizard ──────────────────────────────────────── */}
      <Sheet open={wizard !== null} onOpenChange={(o) => !o && setWizard(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Tasarruf ustasi</SheetTitle>
          </SheetHeader>
          {wizard && (
            <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{wizard.workTitle}</div>
                <div className="text-muted-foreground">
                  {formatNumber(wizard.qtyOnHand)} dona · {wizard.ageDays} kun harakatsiz · muzlagan{" "}
                  {formatUZS(wizard.totalLoss)}
                </div>
                {wizard.suggestedDiscount > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Yosh bosqichi tavsiya qilgan chegirma: −{(wizard.suggestedDiscount * 100).toFixed(0)}% (asosiy
                    narx {formatUZS(wizard.listPrice)} →{" "}
                    {formatUZS(wizard.listPrice * (1 - wizard.suggestedDiscount))})
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {LADDER.map((l) => (
                  <button
                    key={l.action}
                    type="button"
                    onClick={() => setStep(l.action)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-2.5 text-left text-sm transition-colors",
                      step === l.action ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="font-medium">
                      {l.label}
                      {wizard.suggestedAction === l.action && (
                        <span className="ml-2 text-xs font-normal text-primary">tavsiya etilgan</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{l.blurb}</span>
                  </button>
                ))}
              </div>

              {step === "WRITE_OFF" && (
                <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-3">
                  <p className="text-xs text-destructive">
                    Hisobdan chiqarish tasdiqni talab qiladi va uni boshqa foydalanuvchi tasdiqlashi kerak.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label>Ombor</Label>
                    <Select value={wh} onValueChange={(v) => setWh(v ?? "")}>
                      <SelectTrigger>
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
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Miqdor</Label>
                    <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Sabab</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setWizard(null)} disabled={pending}>
                  Bekor qilish
                </Button>
                <Button onClick={submitStep} disabled={pending}>
                  {step === "WRITE_OFF" ? "Tasdiqqa yuborish" : "Bosqichni belgilash"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
