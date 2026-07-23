"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

// enum value → tone (spec §4.3: StatusBadge = enum → colour)
const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "muted", REVIEW: "warning", APPROVED: "info", ACTIVE: "success", OUT_OF_PRINT: "muted",
  PLANNED: "muted", IN_PRODUCTION: "warning", IN_PROGRESS: "warning", IN_REVIEW: "info", DONE: "success",
  REQUESTED: "muted", PRINTING: "warning", RECEIVED: "success",
  CONFIRMED: "info", SHIPPED: "warning", INVOICED: "info", PAID: "success", CANCELLED: "danger",
  OPEN: "warning", PARTIAL: "info", CLOSED: "muted",
  SENT: "success", PENDING: "warning", MATCHED: "success",
  NEW: "info", CONTACTED: "warning", ORDERED: "success", LOST: "danger",
  SELLABLE: "success", DAMAGED: "danger",
};

// enum value → Uzbek label
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Qoralama", REVIEW: "Koʻrib chiqilmoqda", APPROVED: "Tasdiqlangan", ACTIVE: "Faol", OUT_OF_PRINT: "Chop etilmagan",
  PLANNED: "Reja", IN_PRODUCTION: "Ishlab chiqarishda", IN_PROGRESS: "Jarayonda", IN_REVIEW: "Tekshiruvda", DONE: "Tayyor",
  REQUESTED: "Soʻrov", PRINTING: "Bosilmoqda", RECEIVED: "Qabul qilingan",
  CONFIRMED: "Tasdiqlangan", SHIPPED: "Joʻnatilgan", INVOICED: "Hisob-faktura", PAID: "Toʻlangan", CANCELLED: "Bekor qilingan",
  OPEN: "Ochiq", PARTIAL: "Qisman", CLOSED: "Yopilgan",
  SENT: "Yuborilgan", PENDING: "Kutilmoqda", MATCHED: "Solishtirilgan",
  NEW: "Yangi", CONTACTED: "Aloqada", ORDERED: "Buyurtma", LOST: "Yoʻqotilgan",
  SELLABLE: "Sotiladigan", DAMAGED: "Shikastlangan",
};

export function StatusBadge({
  status,
  tone,
  label,
  className,
}: {
  status: string;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const t = tone ?? STATUS_TONES[status] ?? "neutral";
  const text = label ?? STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", TONE_CLASSES[t], className)}>
      {text}
    </Badge>
  );
}
