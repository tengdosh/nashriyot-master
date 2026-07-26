"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PrebuiltData = {
  top: { label: string; value: number }[];
  slowest: { label: string; value: number }[];
  channels: { channel: string; netRevenue: number; cm: number; cmRate: number; units: number }[];
  deadStock: {
    total: number;
    count: number;
    rows: { workTitle: string; sku: string | null; qtyOnHand: number; ageDays: number; totalLoss: number }[];
  };
};

export function PrebuiltReports({ data }: { data: PrebuiltData }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Tayyor hisobotlar</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankCard title="Top-10 asar (sof tushum)" items={data.top} format={formatUZS} />
        <RankCard title="Eng sekin 10 asar (nusxa)" items={data.slowest} format={formatNumber} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kanal rentabelligi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.channels.length === 0 && <Empty />}
            {data.channels.map((c) => (
              <div key={c.channel} className="flex items-center justify-between text-sm">
                <span>{c.channel}</span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">{formatUZS(c.netRevenue)}</span>
                  <span className={cn(c.cm < 0 && "text-destructive")}>
                    CM {formatUZS(c.cm)} ({(c.cmRate * 100).toFixed(0)}%)
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dead-stock dinamikasi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.deadStock.count === 0 ? (
              <Empty />
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  {data.deadStock.count} SKU · muzlagan {formatUZS(data.deadStock.total)}
                </div>
                {data.deadStock.rows.slice(0, 6).map((r) => (
                  <div key={`${r.workTitle}-${r.sku}`} className="flex items-center justify-between text-sm">
                    <span className="truncate">{r.workTitle}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(r.qtyOnHand)} dona · {r.ageDays} kun · {formatUZS(r.totalLoss)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RankCard({
  title,
  items,
  format,
}: {
  title: string;
  items: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {items.length === 0 && <Empty />}
        {items.map((i, idx) => (
          <div key={`${i.label}-${idx}`} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-right text-xs text-muted-foreground">{idx + 1}</span>
            <span className="min-w-28 flex-1 truncate">{i.label}</span>
            <span className="inline-block h-2 rounded-sm bg-primary/50" style={{ width: `${(Math.abs(i.value) / max) * 80}px` }} />
            <span className="w-28 text-right tabular-nums">{format(i.value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return <p className="py-4 text-center text-sm text-muted-foreground">Maʼlumot yoʻq</p>;
}
