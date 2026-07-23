"use client";

import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function KpiCard({
  title,
  value,
  delta,
  hint,
  className,
}: {
  title: string;
  value: React.ReactNode;
  delta?: number;
  hint?: React.ReactNode;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {delta != null && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              up ? "text-success" : "text-destructive",
            )}
          >
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(delta)}%
          </div>
        )}
      </CardContent>
      {hint != null && <div className="px-4 pb-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-36" />
      </CardContent>
    </Card>
  );
}
