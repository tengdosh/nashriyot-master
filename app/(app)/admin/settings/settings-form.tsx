"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/shared/info-hint";
import { saveSettingsAction } from "../actions";

type Settings = {
  vatRate: number;
  deadStockDays: number;
  carryingRate: number;
  expectedROI: number;
  serviceLevelZ: number;
  orderCost: number;
  minTurnover: number;
  goLiveDate: string | null;
};

const NUM_FIELDS: { key: keyof Omit<Settings, "goLiveDate">; label: string; hint: string; step?: string }[] = [
  { key: "vatRate", label: "QQS ulushi (0–1)", hint: "Masalan 0.12 = 12%", step: "0.01" },
  { key: "deadStockDays", label: "Dead-stock chegara (kun)", hint: "Shu kundan oshgan harakatsiz zaxira oʻlik hisoblanadi" },
  { key: "carryingRate", label: "Saqlash ulushi (0–1)", hint: "Yillik saqlash xarajati zaxira qiymatidan", step: "0.01" },
  { key: "expectedROI", label: "Kutilgan ROI (0–1)", hint: "Muzlagan kapitalning imkoniyat qiymati", step: "0.01" },
  { key: "serviceLevelZ", label: "Xizmat darajasi Z", hint: "Xavfsizlik zaxirasi koeffitsienti (1.65 ≈ 95%)", step: "0.01" },
  { key: "orderCost", label: "Buyurtma xarajati (soʻm)", hint: "EOQ hisobidagi bir martalik buyurtma xarajati" },
  { key: "minTurnover", label: "Min. aylanma", hint: "Backlist himoyasi uchun minimal aylanma", step: "0.1" },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [pending, startTransition] = React.useTransition();
  const [values, setValues] = React.useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(settings).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  );

  function save() {
    startTransition(async () => {
      try {
        const payload = {
          ...Object.fromEntries(NUM_FIELDS.map((f) => [f.key, Number(values[f.key])])),
          goLiveDate: values.goLiveDate?.trim() || null,
        };
        await saveSettingsAction(payload);
        toast.success("Sozlamalar saqlandi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        {NUM_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1">
              {f.label}
              <InfoHint>{f.hint}</InfoHint>
            </Label>
            <Input
              value={values[f.key] ?? ""}
              inputMode="decimal"
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label className="flex items-center gap-1">
            Tizim kesish sanasi (goLiveDate)
            <InfoHint>
              Bu sanadan OLDINGI oylar M9 hisobotida &ldquo;tarixiy — to&rsquo;liqmas ma&rsquo;lumot&rdquo;
              belgisi bilan ko&rsquo;rsatiladi. Prognoz (M10) bu ma&rsquo;lumotni ham ishlatishda davom etadi.
              Bo&rsquo;sh qoldirilsa, ogohlantirish ko&rsquo;rsatilmaydi.
            </InfoHint>
          </Label>
          <Input
            type="date"
            value={values.goLiveDate ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, goLiveDate: e.target.value }))}
            className="max-w-[200px]"
          />
        </div>
      </div>
      <div>
        <Button onClick={save} disabled={pending}>
          <Save className="size-4" /> Saqlash
        </Button>
      </div>
    </div>
  );
}
