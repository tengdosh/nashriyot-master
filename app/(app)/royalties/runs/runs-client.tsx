"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { RoyaltyRunStatus } from "@prisma/client";
import { Lock, Play } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatUZS } from "@/lib/format";
import { runRoyaltyAction } from "../actions";

export type RunRow = {
  id: string;
  period: string;
  status: RoyaltyRunStatus;
  periodStart: string;
  periodEnd: string;
  sealed: boolean;
  createdBy: string | null;
  approvedBy: string | null;
  statements: number;
  authors: number;
  earned: number;
  payable: number;
  reserveHeld: number;
  advanceRecouped: number;
};

export function RunsClient({ rows, canWrite }: { rows: RunRow[]; canWrite: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const [period, setPeriod] = React.useState("");

  function build() {
    if (!period.trim()) return;
    startTransition(async () => {
      try {
        const r = await runRoyaltyAction({ period: period.trim() });
        toast.success(
          `${r.period}: ${r.statements} hisobot satri, ${r.skipped} oʻtkazib yuborildi · toʻlanadigan ${r.totalPayable} soʻm`,
        );
        setPeriod("");
        window.location.href = `/royalties/runs/${r.runId}`;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<RunRow>[]>(
    () => [
      {
        accessorKey: "period",
        header: "Davr",
        cell: ({ row }) => (
          <Link href={`/royalties/runs/${row.original.id}`} className="flex flex-col hover:underline">
            <span className="flex items-center gap-1 font-medium">
              {row.original.period}
              {row.original.sealed && (
                <span title="Muhrlangan" className="inline-flex text-muted-foreground">
                  <Lock className="size-3.5" aria-label="Muhrlangan" />
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(row.original.periodStart)} – {formatDate(row.original.periodEnd)}
            </span>
          </Link>
        ),
      },
      {
        accessorKey: "statements",
        header: "Hisobot",
        cell: ({ row }) => (
          <span className="flex flex-col tabular-nums">
            <span>{row.original.statements}</span>
            <span className="text-xs text-muted-foreground">{row.original.authors} muallif</span>
          </span>
        ),
      },
      {
        accessorKey: "earned",
        header: "Hisoblangan",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.earned)}</span>,
      },
      {
        accessorKey: "reserveHeld",
        header: "Zaxira",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.reserveHeld)}</span>,
      },
      {
        accessorKey: "advanceRecouped",
        header: "Avansdan",
        cell: ({ row }) => <span className="tabular-nums">{formatUZS(row.original.advanceRecouped)}</span>,
      },
      {
        accessorKey: "payable",
        header: "Toʻlanadigan",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{formatUZS(row.original.payable)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Holat",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <StatusBadge status={row.original.status} />
            {row.original.approvedBy && (
              <span className="text-xs text-muted-foreground">{row.original.approvedBy} tasdiqladi</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      {canWrite && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="flex flex-col gap-1.5">
            <Label>Davr</Label>
            <Input
              className="w-40"
              value={period}
              placeholder="2026-H1"
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <Button onClick={build} disabled={pending}>
            <Play className="size-4" /> Hisoblash
          </Button>
          <p className="text-xs text-muted-foreground">
            Yarim yil <code>2026-H1</code>, chorak <code>2026-Q3</code> yoki oy <code>2026-M07</code>. Davr
            tugagan boʻlishi kerak; muhrlangan davr bilan kesishsa rad etiladi.
          </p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Davr…"
        csvFileName="royalti-hisoblari.csv"
        pageSize={15}
      />
    </>
  );
}
