"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { formatUZS } from "@/lib/format";

/** 12-month net revenue + CM, drawn with the shared recharts ChartCard. */
export function RevenueChart({ data }: { data: { month: string; net: number; cm: number }[] }) {
  return (
    <ChartCard
      title=""
      data={data}
      xKey="month"
      type="bar"
      height={220}
      series={[
        { key: "net", label: "Sof tushum", color: "var(--chart-1)" },
        { key: "cm", label: "Marja", color: "var(--chart-2)" },
      ]}
      valueFormatter={(v) => formatUZS(v)}
    />
  );
}
