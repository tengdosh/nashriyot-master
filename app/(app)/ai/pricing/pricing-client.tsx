"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { suggestPriceAction, acceptPriceAction, rejectPriceAction } from "../actions";

export type ProductOption = { id: string; sku: string | null; workTitle: string; listPrice: number };
export type RecView = {
  id: string;
  workTitle: string;
  sku: string | null;
  currentPrice: number;
  suggestedPrice: number;
  floorPrice: number;
  rationale: string | null;
};

export function PricingClient({
  options,
  recommendations,
  canApply,
}: {
  options: ProductOption[];
  recommendations: RecView[];
  canApply: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [productId, setProductId] = React.useState(options[0]?.id ?? "");

  function run<T>(fn: () => Promise<T>, onOk: (r: T) => void) {
    startTransition(async () => {
      try {
        onOk(await fn());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function suggest() {
    run(
      () => suggestPriceAction(productId),
      (r) => {
        if (!r.ok) toast.error(r.reason);
        else if (r.skipped) toast.info(r.reason ?? "Oʻzgartirish tavsiya etilmaydi");
        else toast.success("Tavsiya tayyor");
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="flex flex-col gap-1.5">
          <Label>SKU / Asar</Label>
          <Select value={productId} onValueChange={(v) => setProductId(v ?? "")}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.workTitle} {o.sku ? `(${o.sku})` : ""} — {formatUZS(o.listPrice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={suggest} disabled={pending || !productId}>
          <Sparkles className="size-4" /> Narx tavsiya qilish
        </Button>
        <p className="text-xs text-muted-foreground">
          Elastiklik (log-log regressiya) → tushumni maksimallashtiruvchi narx, pol bilan cheklangan. Tavsiya
          faqat inson tasdigʻidan keyin qoʻllanadi.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Kutilayotgan tavsiyalar</h2>
        {recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Kutilayotgan narx tavsiyasi yoʻq.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((r) => {
              const up = r.suggestedPrice > r.currentPrice;
              return (
                <div key={r.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{r.workTitle}</div>
                    <div className="text-xs text-muted-foreground">{r.sku ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Joriy</div>
                      <div className="tabular-nums">{formatUZS(r.currentPrice)}</div>
                    </div>
                    <span className={cn("text-lg", up ? "text-success" : "text-destructive")}>→</span>
                    <div>
                      <div className="text-xs text-muted-foreground">Tavsiya</div>
                      <div className={cn("font-semibold tabular-nums", up ? "text-success" : "text-destructive")}>
                        {formatUZS(r.suggestedPrice)}
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        Pol
                        <InfoHint>Narx pol (P_min)dan past boʻlolmaydi — tannarxni qoplashi shart.</InfoHint>
                      </div>
                      <div className="tabular-nums text-sm">{formatUZS(r.floorPrice)}</div>
                    </div>
                  </div>
                  {r.rationale && <p className="text-xs text-muted-foreground">{r.rationale}</p>}
                  {canApply && (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => rejectPriceAction(r.id), () => toast.success("Rad etildi"))}
                      >
                        <X className="size-4" /> Rad etish
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => acceptPriceAction(r.id), () => toast.success("Qabul qilindi — narx yangilandi"))}
                      >
                        <Check className="size-4" /> Qabul qilish
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
