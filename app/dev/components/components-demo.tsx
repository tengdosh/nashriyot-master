"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import { MoneyText, MoneyInput } from "@/components/shared/money";
import { KpiCard, KpiCardSkeleton } from "@/components/shared/kpi-card";
import { ChartCard } from "@/components/shared/chart-card";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormSheet } from "@/components/shared/form-sheet";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";

type Row = { id: string; book: string; status: string; stock: number; value: number };

const ROWS: Row[] = [
  { id: "T1", book: "Sabr sharbati", status: "ACTIVE", stock: 1200, value: 65_000_000 },
  { id: "T2", book: "Tafakkur bogʻi", status: "OUT_OF_PRINT", stock: 40, value: 2_000_000 },
  { id: "T5", book: "Qalb tozaligi", status: "APPROVED", stock: 800, value: 41_000_000 },
  { id: "H1", book: "Moliyaviy savodxonlik", status: "DRAFT", stock: 0, value: 0 },
  { id: "H9", book: "Boylik psixologiyasi", status: "REVIEW", stock: 250, value: 12_500_000 },
];

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: "id", header: "SKU" },
  { accessorKey: "book", header: "Kitob" },
  {
    accessorKey: "status",
    header: "Holat",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  { accessorKey: "stock", header: "Qoldiq", cell: ({ row }) => row.original.stock.toLocaleString("ru-RU") },
  {
    accessorKey: "value",
    header: "Qiymat",
    cell: ({ row }) => <MoneyText value={row.original.value} />,
  },
];

const CHART = [
  { month: "Yan", sotuv: 42 },
  { month: "Fev", sotuv: 55 },
  { month: "Mar", sotuv: 78 },
  { month: "Apr", sotuv: 61 },
  { month: "May", sotuv: 90 },
  { month: "Iyun", sotuv: 120 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function ComponentsDemo() {
  const [amount, setAmount] = React.useState(12_000_000);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const form = useForm<{ name: string; note: string }>({ defaultValues: { name: "", note: "" } });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Umumiy komponentlar</h1>
        <p className="text-muted-foreground">Dev galereya — 8 ta umumiy komponent bir joyda.</p>
      </div>

      <Section title="1 — KpiCard">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard title="Oylik sotuv" value={<MoneyText value={735_000_000} />} delta={12} />
          <KpiCard title="Dead-stock" value="4.2%" delta={-3} hint="120 kundan oshgan" />
          <KpiCardSkeleton />
        </div>
      </Section>

      <Section title="2 — StatusBadge">
        <div className="flex flex-wrap gap-2">
          {["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "OUT_OF_PRINT", "PAID", "CANCELLED", "SENT", "PENDING"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="3 — MoneyText / MoneyInput (+ InfoHint)">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <MoneyText value={amount} className="text-lg font-semibold" />
            <InfoHint>Kiritilgan summa jonli formatlanadi.</InfoHint>
          </div>
          <div className="w-56">
            <MoneyInput value={amount} onValueChange={setAmount} />
          </div>
        </div>
      </Section>

      <Section title="4 — ChartCard (Recharts)">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sotuv trendi" data={CHART} xKey="month" series={[{ key: "sotuv", label: "Sotuv" }]} type="line" />
          <ChartCard title="Oylik hajm" data={CHART} xKey="month" series={[{ key: "sotuv", label: "Sotuv" }]} type="bar" />
        </div>
      </Section>

      <Section title="5 — DataTable (sort, filter, ustun yashirish, CSV)">
        <DataTable columns={COLUMNS} data={ROWS} csvFileName="kitoblar.csv" searchPlaceholder="Kitob qidirish…" />
      </Section>

      <Section title="6 — ConfirmDialog">
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Oʻchirishni tasdiqlash
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Yozuvni oʻchirasizmi?"
          description="Bu amalni orqaga qaytarib boʻlmaydi (demo)."
          destructive
          makerCheckerWarning
          onConfirm={() => {
            toast.success("Tasdiqlandi (demo)");
          }}
        />
      </Section>

      <Section title="7 — FormSheet (react-hook-form)">
        <Button onClick={() => setSheetOpen(true)}>Yangi yozuv</Button>
        <FormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Yangi yozuv"
          description="FormSheet — modal emas, oʻngdan panel."
          form={form}
          onSubmit={(v) => {
            toast.success(`Saqlandi: ${v.name || "(nomsiz)"}`);
            setSheetOpen(false);
            form.reset();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nomi</Label>
            <Input id="name" {...form.register("name")} placeholder="Kitob nomi" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Izoh</Label>
            <Input id="note" {...form.register("note")} placeholder="Izoh" />
          </div>
        </FormSheet>
      </Section>

      <Section title="8 — EmptyState / ErrorState">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState description="Hozircha yozuvlar yoʻq." />
          <ErrorState description="Maʼlumotni yuklab boʻlmadi." onRetry={() => toast.info("Qayta urinildi (demo)")} />
        </div>
      </Section>

      <p className="text-xs text-muted-foreground">
        Namuna: {formatUZS(217_400)} · {formatUZS(120_778)}
      </p>
    </div>
  );
}
