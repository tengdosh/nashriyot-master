"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createTitleAction } from "../actions";

type Opt = { id: string; name: string; code?: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function TitleWizard({
  entities,
  extPublishers,
  series,
}: {
  entities: Opt[];
  extPublishers: Opt[];
  series: Opt[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [pending, setPending] = React.useState(false);
  const [workTitle, setWorkTitle] = React.useState("");
  const [ownerType, setOwnerType] = React.useState<"OWN" | "EXTERNAL">("OWN");
  const [entityId, setEntityId] = React.useState(entities[0]?.id ?? "");
  const [ownerPartnerId, setOwnerPartnerId] = React.useState(extPublishers[0]?.id ?? "");
  const [seriesId, setSeriesId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [keywords, setKeywords] = React.useState("");

  const step1Valid =
    workTitle.trim().length >= 2 && (ownerType === "OWN" ? !!entityId : !!ownerPartnerId);

  async function submit() {
    setPending(true);
    try {
      const { id } = await createTitleAction({
        workTitle: workTitle.trim(),
        ownerType,
        entityId: ownerType === "OWN" ? entityId : null,
        ownerPartnerId: ownerType === "EXTERNAL" ? ownerPartnerId : null,
        language: "uz",
        seriesId: seriesId || null,
        description: description || null,
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        themaCodes: [],
        bisacCodes: [],
      });
      toast.success("Asar yaratildi (DRAFT)");
      router.push(`/titles/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xatolik");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Yangi asar</h1>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs",
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted",
            )}
          >
            {s}
          </span>
        ))}
        <span>{step === 1 ? "Umumiy" : step === 2 ? "Metaʼmaʼlumot" : "Koʻrib chiqish"}</span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-2">
          {step === 1 && (
            <>
              <Field label="Sarlavha">
                <Input value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} placeholder="Asar nomi" />
              </Field>
              <Field label="Egalik turi">
                <Select value={ownerType} onValueChange={(v) => setOwnerType(v as "OWN" | "EXTERNAL")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWN">Oʻz nashri</SelectItem>
                    <SelectItem value="EXTERNAL">Tashqi nashriyot</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {ownerType === "OWN" ? (
                <Field label="Subʼekt (nashriyot)">
                  <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Egasi (tashqi nashriyot)">
                  <Select value={ownerPartnerId} onValueChange={(v) => setOwnerPartnerId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {extPublishers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Annotatsiya">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </Field>
              <Field label="Kalit soʻzlar (vergul bilan)">
                <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="sabr, tarbiya, oila" />
              </Field>
              {series.length > 0 && (
                <Field label="Seriya (ixtiyoriy)">
                  <Select value={seriesId} onValueChange={(v) => setSeriesId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {series.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}

          {step === 3 && (
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Sarlavha</dt>
              <dd className="font-medium">{workTitle}</dd>
              <dt className="text-muted-foreground">Egalik</dt>
              <dd>
                {ownerType === "OWN"
                  ? entities.find((e) => e.id === entityId)?.name
                  : `${extPublishers.find((p) => p.id === ownerPartnerId)?.name} (tashqi)`}
              </dd>
              <dt className="text-muted-foreground">Kalit soʻzlar</dt>
              <dd>{keywords || "—"}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1 || pending} onClick={() => setStep((s) => s - 1)}>
          Orqaga
        </Button>
        {step < 3 ? (
          <Button disabled={step === 1 && !step1Valid} onClick={() => setStep((s) => s + 1)}>
            Keyingi
          </Button>
        ) : (
          <Button disabled={pending || !step1Valid} onClick={submit}>
            {pending ? "Yaratilmoqda…" : "Yaratish (DRAFT)"}
          </Button>
        )}
      </div>
    </div>
  );
}
