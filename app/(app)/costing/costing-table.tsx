"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CostRow = {
  productId: string;
  sku: string | null;
  workTitle: string;
  reportCost: number | null;
  decisionCost: number | null;
  expNet: number;
  reportMargin: number | null;
  hasSnapshot: boolean;
};

export function CostingTable({ rows }: { rows: CostRow[] }) {
  const columns = React.useMemo<ColumnDef<CostRow>[]>(
    () => [
      {
        accessorKey: "workTitle",
        header: "Asar / SKU",
        cell: ({ row }) => (
          <Link href={`/costing/${row.original.productId}`} className="flex flex-col hover:underline">
            <span className="font-medium">{row.original.workTitle}</span>
            <span className="text-xs text-muted-foreground">{row.original.sku ?? "—"}</span>
          </Link>
        ),
      },
      {
        accessorKey: "reportCost",
        header: "reportCost",
        cell: ({ row }) =>
          row.original.reportCost != null ? (
            <span className="tabular-nums">{formatUZS(row.original.reportCost)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">surat yoʻq</span>
          ),
      },
      {
        accessorKey: "decisionCost",
        header: "decisionCost",
        cell: ({ row }) =>
          row.original.decisionCost != null ? (
            <span className="flex items-center gap-1 tabular-nums">
              {formatUZS(row.original.decisionCost)}
              <InfoHint>Narx poli — sunk&apos;siz. Unikal va yig&apos;ilgan doimiy bu yerga kirmaydi.</InfoHint>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "expNet",
        header: "Kutilgan sof narx",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.expNet)}</span>,
      },
      {
        accessorKey: "reportMargin",
        header: "Marja (report)",
        cell: ({ row }) =>
          row.original.reportMargin != null ? (
            <span className={cn("tabular-nums", row.original.reportMargin < 0 && "font-medium text-destructive")}>
              {(row.original.reportMargin * 100).toFixed(1)}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Asar yoki SKU…"
      csvFileName="tan-narx.csv"
      pageSize={20}
    />
  );
}
