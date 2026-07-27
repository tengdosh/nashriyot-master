"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enqueue } from "@/lib/offline-queue";

type QuickType = "sale" | "payment" | "expense" | "transfer";

interface Props {
  type: QuickType;
  products: { id: string; label: string }[];
  warehouses: { id: string; name: string; entityId: string; type: string }[];
  channels: { id: string; name: string }[];
  entities: { id: string; name: string }[];
}

// ─── Zod sxemalari ───────────────────────────────────────────────────────────

const saleSchema = z.object({
  productId: z.string().min(1, "Mahsulot tanlanishi kerak"),
  qty: z.number().int().positive("Miqdor 0 dan katta bo'lishi kerak"),
  unitPrice: z.number().nonnegative("Narx manfiy bo'lmasligi kerak"),
  channelId: z.string().min(1, "Kanal tanlanishi kerak"),
  entityId: z.string().min(1, "Sub'ekt tanlanishi kerak"),
  warehouseId: z.string().min(1, "Ombor tanlanishi kerak"),
});
type SaleValues = z.infer<typeof saleSchema>;

const paymentSchema = z.object({
  amount: z.number().positive("Summa 0 dan katta bo'lishi kerak"),
  direction: z.enum(["IN", "OUT"]),
  method: z.enum(["CASH", "CARD", "BANK"]),
  entityId: z.string().min(1, "Sub'ekt tanlanishi kerak"),
  note: z.string().max(500).optional(),
});
type PaymentValues = z.infer<typeof paymentSchema>;

const expenseSchema = z.object({
  amount: z.number().positive("Miqdor 0 dan katta bo'lishi kerak"),
  category: z.string().min(1, "Kategoriya tanlanishi kerak"),
  date: z.string().min(1, "Sana tanlanishi kerak"),
  note: z.string().max(500).optional(),
  entityId: z.string().optional(),
});
type ExpenseValues = z.infer<typeof expenseSchema>;

const transferSchema = z.object({
  productId: z.string().min(1, "Mahsulot tanlanishi kerak"),
  qty: z.number().int().positive("Miqdor 0 dan katta bo'lishi kerak"),
  fromEntityId: z.string().min(1, "Manba sub'ekt tanlanishi kerak"),
  toEntityId: z.string().min(1, "Manzil sub'ekt tanlanishi kerak"),
  fromWarehouseId: z.string().min(1, "Manba ombor tanlanishi kerak"),
  toWarehouseId: z.string().min(1, "Manzil ombor tanlanishi kerak"),
  note: z.string().max(500).optional(),
});
type TransferValues = z.infer<typeof transferSchema>;

type AnyValues = SaleValues | PaymentValues | ExpenseValues | TransferValues;

const EXPENSE_CATEGORIES = [
  { value: "IJARA", label: "Ijara" },
  { value: "OYLIK", label: "Oylik" },
  { value: "KOMMUNAL", label: "Kommunal" },
  { value: "MARKETING_BRAND", label: "Marketing (brend)" },
  { value: "MARKETING_TITLE", label: "Marketing (kitob)" },
  { value: "BOSMA", label: "Bosma" },
  { value: "DIZAYN", label: "Dizayn" },
  { value: "TAHRIR", label: "Tahrir" },
  { value: "TARJIMA", label: "Tarjima" },
  { value: "HUQUQ", label: "Huquq" },
  { value: "BOSHQA", label: "Boshqa" },
] as const;

// ─── Yordamchi komponentlar ────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function SelectField({
  label,
  id,
  options,
  error,
  ...rest
}: {
  label: string;
  id: string;
  options: { value: string; label: string }[];
  error?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      >
        <option value="">— Tanlang —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

function NumberField({
  label,
  id,
  error,
  ...rest
}: {
  label: string;
  id: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement> & { valueAsNumber?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} {...rest} />
      <FieldError message={error} />
    </div>
  );
}

function TextField({
  label,
  id,
  error,
  ...rest
}: {
  label: string;
  id: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="text" {...rest} />
      <FieldError message={error} />
    </div>
  );
}

// ─── Forma: Sotuv ─────────────────────────────────────────────────────────────
function SaleForm({ products, channels, warehouses, entities }: Props) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      entityId: entities[0]?.id ?? "",
      channelId: channels[0]?.id ?? "",
    },
  });

  const selectedEntityId = watch("entityId");
  const entityWarehouses = warehouses
    .filter((w) => w.entityId === selectedEntityId)
    .map((w) => ({ value: w.id, label: w.name }));

  async function onSubmit(data: SaleValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/entry/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Sotuv saqlandi");
        reset();
      } else if (!navigator.onLine || res.status === 503) {
        const id = enqueue("sale", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        const json = await res.json();
        toast.error(json?.error?.message ?? "Xatolik yuz berdi");
      }
    } catch {
      if (!navigator.onLine) {
        const id = enqueue("sale", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        toast.error("Server bilan bog'lanishda xatolik");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <SelectField
        label="Sub'ekt"
        id="entityId"
        options={entities.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.entityId?.message}
        {...register("entityId")}
      />
      <SelectField
        label="Mahsulot"
        id="productId"
        options={products.map((p) => ({ value: p.id, label: p.label }))}
        error={errors.productId?.message}
        {...register("productId")}
      />
      <NumberField
        label="Miqdor (dona)"
        id="qty"
        min={1}
        step={1}
        error={errors.qty?.message}
        {...register("qty", { valueAsNumber: true })}
      />
      <NumberField
        label="Narx (so'm)"
        id="unitPrice"
        min={0}
        step={100}
        error={errors.unitPrice?.message}
        {...register("unitPrice", { valueAsNumber: true })}
      />
      <SelectField
        label="Kanal"
        id="channelId"
        options={channels.map((c) => ({ value: c.id, label: c.name }))}
        error={errors.channelId?.message}
        {...register("channelId")}
      />
      <SelectField
        label="Ombor"
        id="warehouseId"
        options={entityWarehouses.length ? entityWarehouses : warehouses.map((w) => ({ value: w.id, label: w.name }))}
        error={errors.warehouseId?.message}
        {...register("warehouseId")}
      />
      <Button type="submit" disabled={loading} className="mt-2 h-12 text-base">
        {loading ? "Saqlanmoqda…" : "Saqlash"}
      </Button>
    </form>
  );
}

// ─── Forma: To'lov ────────────────────────────────────────────────────────────
function PaymentForm({ entities }: Props) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      direction: "IN",
      method: "CASH",
      entityId: entities[0]?.id ?? "",
    },
  });

  async function onSubmit(data: PaymentValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/entry/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("To'lov saqlandi");
        reset();
      } else if (!navigator.onLine || res.status === 503) {
        const id = enqueue("payment", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        const json = await res.json();
        toast.error(json?.error?.message ?? "Xatolik yuz berdi");
      }
    } catch {
      if (!navigator.onLine) {
        const id = enqueue("payment", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        toast.error("Server bilan bog'lanishda xatolik");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <SelectField
        label="Sub'ekt"
        id="entityId"
        options={entities.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.entityId?.message}
        {...register("entityId")}
      />
      <NumberField
        label="Summa (so'm)"
        id="amount"
        min={1}
        step={1000}
        error={errors.amount?.message}
        {...register("amount", { valueAsNumber: true })}
      />
      <div className="flex flex-col gap-1.5">
        <Label>Yo'nalish</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "IN", label: "Kiruvchi" },
              { value: "OUT", label: "Chiquvchi" },
            ] as const
          ).map(({ value, label }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input type="radio" value={value} {...register("direction")} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <FieldError message={errors.direction?.message} />
      </div>
      <SelectField
        label="To'lov usuli"
        id="method"
        options={[
          { value: "CASH", label: "Naqd" },
          { value: "CARD", label: "Karta" },
          { value: "BANK", label: "Bank o'tkazmasi" },
        ]}
        error={errors.method?.message}
        {...register("method")}
      />
      <TextField
        label="Izoh (ixtiyoriy)"
        id="note"
        placeholder="To'lov maqsadi…"
        error={errors.note?.message}
        {...register("note")}
      />
      <Button type="submit" disabled={loading} className="mt-2 h-12 text-base">
        {loading ? "Saqlanmoqda…" : "Saqlash"}
      </Button>
    </form>
  );
}

// ─── Forma: Xarajat ────────────────────────────────────────────────────────────
function ExpenseForm({ entities }: Props) {
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: today,
      category: "BOSHQA",
      entityId: entities[0]?.id ?? "",
    },
  });

  async function onSubmit(data: ExpenseValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/entry/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Xarajat saqlandi");
        reset({ date: today, category: "BOSHQA", entityId: data.entityId });
      } else if (!navigator.onLine || res.status === 503) {
        const id = enqueue("expense", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset({ date: today, category: "BOSHQA", entityId: data.entityId });
      } else {
        const json = await res.json();
        toast.error(json?.error?.message ?? "Xatolik yuz berdi");
      }
    } catch {
      if (!navigator.onLine) {
        const id = enqueue("expense", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset({ date: today, category: "BOSHQA", entityId: data.entityId });
      } else {
        toast.error("Server bilan bog'lanishda xatolik");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <SelectField
        label="Sub'ekt"
        id="entityId"
        options={entities.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.entityId?.message}
        {...register("entityId")}
      />
      <NumberField
        label="Miqdor (so'm)"
        id="amount"
        min={1}
        step={1000}
        error={errors.amount?.message}
        {...register("amount", { valueAsNumber: true })}
      />
      <SelectField
        label="Kategoriya"
        id="category"
        options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        error={errors.category?.message}
        {...register("category")}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date">Sana</Label>
        <Input id="date" type="date" {...register("date")} />
        <FieldError message={errors.date?.message} />
      </div>
      <TextField
        label="Izoh (ixtiyoriy)"
        id="note"
        placeholder="Xarajat tavsifi…"
        error={errors.note?.message}
        {...register("note")}
      />
      <Button type="submit" disabled={loading} className="mt-2 h-12 text-base">
        {loading ? "Saqlanmoqda…" : "Saqlash"}
      </Button>
    </form>
  );
}

// ─── Forma: Transfer ──────────────────────────────────────────────────────────
function TransferForm({ products, warehouses, entities }: Props) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromEntityId: entities[0]?.id ?? "",
      toEntityId: entities[1]?.id ?? entities[0]?.id ?? "",
    },
  });

  const fromEntityId = watch("fromEntityId");
  const toEntityId = watch("toEntityId");

  const fromWarehouses = warehouses
    .filter((w) => w.entityId === fromEntityId)
    .map((w) => ({ value: w.id, label: w.name }));

  const toWarehouses = warehouses
    .filter((w) => w.entityId === toEntityId)
    .map((w) => ({ value: w.id, label: w.name }));

  async function onSubmit(data: TransferValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/entry/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Transfer yaratildi");
        reset();
      } else if (!navigator.onLine || res.status === 503) {
        const id = enqueue("transfer", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        const json = await res.json();
        toast.error(json?.error?.message ?? "Xatolik yuz berdi");
      }
    } catch {
      if (!navigator.onLine) {
        const id = enqueue("transfer", data);
        toast.info("Offline: navbatga saqlandi", { description: `ID: ${id.slice(0, 8)}…` });
        reset();
      } else {
        toast.error("Server bilan bog'lanishda xatolik");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <SelectField
        label="Mahsulot"
        id="productId"
        options={products.map((p) => ({ value: p.id, label: p.label }))}
        error={errors.productId?.message}
        {...register("productId")}
      />
      <NumberField
        label="Miqdor (dona)"
        id="qty"
        min={1}
        step={1}
        error={errors.qty?.message}
        {...register("qty", { valueAsNumber: true })}
      />
      <SelectField
        label="Manba sub'ekt"
        id="fromEntityId"
        options={entities.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.fromEntityId?.message}
        {...register("fromEntityId")}
      />
      <SelectField
        label="Manba ombor"
        id="fromWarehouseId"
        options={fromWarehouses.length ? fromWarehouses : warehouses.map((w) => ({ value: w.id, label: w.name }))}
        error={errors.fromWarehouseId?.message}
        {...register("fromWarehouseId")}
      />
      <SelectField
        label="Manzil sub'ekt"
        id="toEntityId"
        options={entities.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.toEntityId?.message}
        {...register("toEntityId")}
      />
      <SelectField
        label="Manzil ombor"
        id="toWarehouseId"
        options={toWarehouses.length ? toWarehouses : warehouses.map((w) => ({ value: w.id, label: w.name }))}
        error={errors.toWarehouseId?.message}
        {...register("toWarehouseId")}
      />
      <TextField
        label="Sabab (ixtiyoriy)"
        id="note"
        placeholder="Transfer sababi…"
        error={errors.note?.message}
        {...register("note")}
      />
      <Button type="submit" disabled={loading} className="mt-2 h-12 text-base">
        {loading ? "Saqlanmoqda…" : "Yaratish"}
      </Button>
    </form>
  );
}

// ─── Asosiy eksport ───────────────────────────────────────────────────────────

export function QuickForm(props: Props) {
  const { type } = props;

  switch (type) {
    case "sale":
      return <SaleForm {...props} />;
    case "payment":
      return <PaymentForm {...props} />;
    case "expense":
      return <ExpenseForm {...props} />;
    case "transfer":
      return <TransferForm {...props} />;
    default:
      return null;
  }
}
