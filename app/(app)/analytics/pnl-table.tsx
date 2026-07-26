"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoHint } from "@/components/shared/info-hint";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PnlRowView = {
  entityId: string;
  entityName: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  royalty: number;
  fixedCosts: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
};

export type PnlView = { rows: PnlRowView[]; total: PnlRowView };

export function PnlTable({ pnl, window }: { pnl: PnlView; window: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Foyda-Zarar (sub&apos;ekt kesimida)</h2>
        <span className="text-sm text-muted-foreground">{window}</span>
        <InfoHint>
          Har sub&apos;ekt uchun: sof tushum → tannarx → yalpi foyda → royalti → doimiy xarajat → sof foyda.
          Jami satri satrlardan yigʻiladi (v2 §6).
        </InfoHint>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub&apos;ekt</TableHead>
              <TableHead className="text-right">Sof tushum</TableHead>
              <TableHead className="text-right">Tannarx</TableHead>
              <TableHead className="text-right">Yalpi foyda</TableHead>
              <TableHead className="text-right">Royalti</TableHead>
              <TableHead className="text-right">Doimiy xarajat</TableHead>
              <TableHead className="text-right">Sof foyda</TableHead>
              <TableHead className="text-right">Marja</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pnl.rows.map((r) => (
              <PnlLine key={r.entityId} r={r} />
            ))}
            <PnlLine r={pnl.total} isTotal />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PnlLine({ r, isTotal }: { r: PnlRowView; isTotal?: boolean }) {
  return (
    <TableRow className={cn(isTotal && "border-t-2 font-semibold")}>
      <TableCell className={cn(!isTotal && "font-medium")}>{r.entityName}</TableCell>
      <TableCell className="text-right tabular-nums">{formatUZS(r.revenue)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">−{formatUZS(r.cogs)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatUZS(r.grossProfit)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">−{formatUZS(r.royalty)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">−{formatUZS(r.fixedCosts)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", r.netProfit < 0 && "text-destructive")}>
        {formatUZS(r.netProfit)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{(r.netMargin * 100).toFixed(1)}%</TableCell>
    </TableRow>
  );
}
