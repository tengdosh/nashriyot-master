"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadGeoAction, generateGeoAction, approveGeoAction } from "./actions";

export type GeoTitleRow = {
  id: string;
  workTitle: string;
  language: string;
  keywordCount: number;
  geoStatus: "DRAFT" | "APPROVED" | null;
};

type Detail = Awaited<ReturnType<typeof loadGeoAction>>;

export function GeoClient({
  titles,
  canApply,
  enabled,
}: {
  titles: GeoTitleRow[];
  canApply: boolean;
  enabled: boolean;
}) {
  const [busy, startTransition] = React.useTransition();
  const [titleId, setTitleId] = React.useState<string>("");
  const [detail, setDetail] = React.useState<Detail | null>(null);

  function select(id: string) {
    setTitleId(id);
    setDetail(null);
    if (!id) return;
    startTransition(async () => {
      try {
        setDetail(await loadGeoAction(id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function generate() {
    startTransition(async () => {
      try {
        const r = await generateGeoAction(titleId);
        if (!r.ok && r.unavailable) {
          toast.error(r.error ?? "AI mavjud emas");
          return;
        }
        setDetail(await loadGeoAction(titleId));
        toast.success("Tavsiya tayyorlandi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function approve(id: string) {
    startTransition(async () => {
      try {
        await approveGeoAction(id);
        setDetail(await loadGeoAction(titleId));
        toast.success("Tasdiqlandi va kitobga yozildi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const geo = detail?.geo ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-col gap-1.5">
          <label className="text-sm font-medium">Kitob</label>
          <Select value={titleId} onValueChange={(v) => select(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
            <SelectContent>
              {titles.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.workTitle} {t.geoStatus ? `· ${t.geoStatus === "APPROVED" ? "✓" : "qoralama"}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={generate} disabled={busy || !titleId || !enabled} title={!enabled ? "AI oʻchirilgan" : undefined}>
          <Sparkles className="size-4" /> {geo ? "Qayta generatsiya" : "Tavsiya generatsiya"}
        </Button>
      </div>

      {detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Current */}
          <div className="rounded-lg border p-4">
            <div className="mb-2 text-sm font-medium text-muted-foreground">Joriy (kitobda)</div>
            <Field label="Tavsif" value={detail.current.description ?? "—"} />
            <Field label="Kalit soʻzlar" value={detail.current.keywords.length ? detail.current.keywords.join(", ") : "—"} />
          </div>

          {/* Recommended */}
          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Tavsiya (AI)</span>
              {geo ? (
                <StatusBadge status={geo.status} tone={geo.status === "APPROVED" ? "success" : "warning"} label={geo.status === "APPROVED" ? "Tasdiqlangan" : "Qoralama"} />
              ) : (
                <span className="text-xs text-muted-foreground">hali yoʻq</span>
              )}
            </div>
            {geo ? (
              <>
                <Field label="Meta sarlavha" value={geo.metaTitle} />
                <Field label="Meta tavsif" value={geo.metaDescription} />
                <Field label="Kalit soʻzlar" value={geo.keywords.join(", ")} />
                {geo.blurb && <Field label="Marketing matni" value={geo.blurb} />}
                <div className="mt-1 text-xs text-muted-foreground">Model: {geo.model} · {geo.promptVersion}</div>
                {canApply && geo.status === "DRAFT" && (
                  <Button className="mt-3" size="sm" disabled={busy} onClick={() => approve(geo.id)}>
                    <CheckCircle2 className="size-4" /> Tasdiqlash va kitobga yozish
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tavsiya generatsiya qiling.</p>
            )}
          </div>

          {/* JSON-LD */}
          {geo && (
            <div className="rounded-lg border p-4 lg:col-span-2">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Code2 className="size-4 text-muted-foreground" /> schema.org JSON-LD
              </div>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
                {JSON.stringify(geo.jsonLd, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {!detail && titles.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Kitoblar yoʻq.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
