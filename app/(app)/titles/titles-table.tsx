"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";

export type TitleRow = {
  id: string;
  workTitle: string;
  status: string;
  ownerType: string;
  entity: string;
  authors: string;
  formats: string[];
  editions: number;
};

const FORMAT_LABEL: Record<string, string> = {
  HARDCOVER: "Qattiq",
  PAPERBACK: "Yumshoq",
  EBOOK: "E-kitob",
  AUDIO: "Audio",
};

const columns: ColumnDef<TitleRow>[] = [
  {
    accessorKey: "workTitle",
    header: "Sarlavha",
    cell: ({ row }) => (
      <Link href={`/titles/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.workTitle}
      </Link>
    ),
  },
  { accessorKey: "entity", header: "Subʼekt" },
  { accessorKey: "authors", header: "Mualliflar", cell: ({ row }) => row.original.authors || "—" },
  {
    accessorKey: "formats",
    header: "Formatlar",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.formats.map((f) => (
          <Badge key={f} variant="secondary" className="text-[10px]">
            {FORMAT_LABEL[f] ?? f}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "ownerType",
    header: "Egalik",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.ownerType === "EXTERNAL" ? "Tashqi" : "Oʻz"}</Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Holat",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function TitlesTable({ rows }: { rows: TitleRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      csvFileName="sarlavhalar.csv"
      searchPlaceholder="Sarlavha qidirish…"
    />
  );
}
