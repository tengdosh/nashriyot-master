"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReturnCondition, SalesOrderStatus } from "@prisma/client";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";

export type ReturnRow = {
  id: string;
  date: string;
  qty: number;
  condition: ReturnCondition;
  workTitle: string;
  sku: string | null;
  orderId: string;
  who: string;
  orderStatus: SalesOrderStatus;
  netUnit: number;
};

export function ReturnsTable({ rows }: { rows: ReturnRow[] }) {
  const columns = React.useMemo<ColumnDef<ReturnRow>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Sana",
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: "who",
        header: "Mijoz",
        cell: ({ row }) => (
          <Link href={`/sales/orders/${row.original.orderId}`} className="font-medium hover:underline">
            {row.original.who}
          </Link>
        ),
      },
      {
        accessorKey: "workTitle",
        header: "Asar / SKU",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.workTitle}</span>
            <span className="text-xs text-muted-foreground">{row.original.sku ?? "—"}</span>
          </div>
        ),
      },
      {
        accessorKey: "qty",
        header: "Miqdor",
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.qty)}</span>,
      },
      {
        accessorKey: "condition",
        header: "Holati",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <StatusBadge status={row.original.condition} />
            <span className="text-xs text-muted-foreground">
              {row.original.condition === "SELLABLE" ? "zaxiraga qaytdi" : "zaxiraga qaytmadi"}
            </span>
          </div>
        ),
      },
      {
        id: "Sof ta'sir",
        header: "Sof sotuvga taʼsir",
        cell: ({ row }) => (
          <span className="tabular-nums text-destructive">
            −{formatUZS(row.original.netUnit * row.original.qty)}
          </span>
        ),
      },
      {
        accessorKey: "orderStatus",
        header: "Buyurtma holati",
        cell: ({ row }) => <StatusBadge status={row.original.orderStatus} />,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Mijoz, asar yoki SKU…"
      csvFileName="qaytishlar.csv"
      pageSize={20}
    />
  );
}
