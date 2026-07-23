"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./states";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Series = { key: string; label?: string; color?: string };

export function ChartCard({
  title,
  description,
  data,
  xKey,
  series,
  type = "line",
  loading,
  height = 240,
  className,
  valueFormatter,
}: {
  title: string;
  description?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: Series[];
  type?: "line" | "bar";
  loading?: boolean;
  height?: number;
  className?: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton style={{ height }} className="w-full" />
        ) : data.length === 0 ? (
          <EmptyState className="border-0" />
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              {type === "line" ? (
                <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 12 }} width={52} stroke="var(--muted-foreground)" tickFormatter={valueFormatter} />
                  <RTooltip
                    formatter={
                      valueFormatter
                        ? (((v: number | string) => valueFormatter(Number(v))) as never)
                        : undefined
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                  {series.map((s, i) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label ?? s.key}
                      stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 12 }} width={52} stroke="var(--muted-foreground)" tickFormatter={valueFormatter} />
                  <RTooltip
                    formatter={
                      valueFormatter
                        ? (((v: number | string) => valueFormatter(Number(v))) as never)
                        : undefined
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                  {series.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label ?? s.key}
                      fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
