"use client";

import * as React from "react";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Dependency-free bar chart of earned vs payable per sent period. */
export function EarningsChart({ data }: { data: { month: string; earned: number; payable: number }[] }) {
  const max = Math.max(...data.map((d) => d.earned), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3 overflow-x-auto" style={{ minHeight: 140 }}>
        {data.map((d) => (
          <div key={d.month} className="flex min-w-14 flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-1">
              <div
                className="w-1/2 rounded-t bg-primary/70"
                style={{ height: `${Math.max((d.earned / max) * 100, 2)}%` }}
                title={`Hisoblangan: ${formatUZS(d.earned)}`}
              />
              <div
                className={cn("w-1/2 rounded-t bg-primary")}
                style={{ height: `${Math.max((d.payable / max) * 100, 2)}%` }}
                title={`Toʻlangan: ${formatUZS(d.payable)}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-primary/70" /> Hisoblangan
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-primary" /> Toʻlangan
        </span>
      </div>
    </div>
  );
}
