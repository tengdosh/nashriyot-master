"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { StockMovementType, WarehouseType } from "@prisma/client";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";

export type MovementRow = {
  id: string;
  date: string;
  type: StockMovementType;
  workTitle: string;
  sku: string | null;
  warehouse: string;
  warehouseType: WarehouseType;
  qty: number;
  unitCost: number | null;
  qtyRemaining: number | null;
  refType: string | null;
  reason: string | null;
};

const TYPE_META: Record<
  StockMovementType,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "muted" }
> = {
  IN: { label: "Kirim", tone: "success" },
  OUT: { label: "Chiqim (sotuv)", tone: "info" },
  TRANSFER: { label: "Transfer", tone: "warning" },
  ADJUST: { label: "Tuzatish", tone: "danger" },
  RETURN: { label: "Qaytish", tone: "muted" },
};

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  const columns = React.useMemo<ColumnDef<MovementRow>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Sana",
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: "type",
        header: "Turi",
        cell: ({ row }) => {
          const m = TYPE_META[row.original.type];
          return <StatusBadge status={row.original.type} tone={m.tone} label={m.label} />;
        },
      },
      {
        accessorKey: "workTitle",
        header: "Asar / SKU",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.workTitle}</span>
            <span className="text-xs text-muted-foreground">{row.original.sku ?? "—"}</span>
          </div>
        ),
      },
      {
        accessorKey: "warehouse",
        header: "Ombor",
        cell: ({ row }) => (
          <span>
            {row.original.warehouse}
            {row.original.warehouseType === "AGENT" && (
              <span className="ml-1 text-xs text-muted-foreground">· konsignatsiya</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "qty",
        header: "Miqdor",
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.qty)}</span>,
      },
      {
        accessorKey: "unitCost",
        header: "Birlik narx",
        cell: ({ row }) =>
          row.original.unitCost == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{formatUZS(row.original.unitCost)}</span>
          ),
      },
      {
        accessorKey: "qtyRemaining",
        header: "Qatlam qoldigʻi",
        cell: ({ row }) =>
          row.original.qtyRemaining == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">{formatNumber(row.original.qtyRemaining)}</span>
          ),
      },
      { accessorKey: "refType", header: "Manba" },
      {
        accessorKey: "reason",
        header: "Sabab",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.reason ?? "—"}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Asar, ombor yoki sabab…"
      csvFileName="ombor-harakatlari.csv"
      pageSize={20}
    />
  );
}
