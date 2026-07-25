"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ContributorRole, RoyaltyRunStatus } from "@prisma/client";
import { Check, ChevronDown, ChevronRight, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { approveRoyaltyRunAction, sendRoyaltyRunAction } from "../../actions";

type TierDetail = {
  tierId: string | null;
  range: string;
  units: number;
  basis: string;
  baseUnit: string;
  rate: string;
  amount: string;
  explain: string;
};

export type StatementView = {
  id: string;
  contributor: string;
  contributorRole: ContributorRole;
  workTitle: string;
  unitsSold: number;
  returnedUnits: number;
  netUnits: number;
  cumulativeBefore: number;
  earned: number;
  reserveHeld: number;
  reserveReleased: number;
  advanceRecouped: number;
  advanceOutstanding: number;
  payable: number;
  detail: {
    reserveRate: string;
    returnImpact: string;
    payableBefore: string;
    previousStatementId: string | null;
    byFormat: {
      format: string;
      cumulativeBefore: number;
      unitsSold: number;
      returnedUnits: number;
      netUnits: number;
      listUnit: string;
      netUnit: string;
      uncoveredUnits: number;
      tiers: TierDetail[];
    }[];
  } | null;
};

export function RunDetail({
  runId,
  period,
  status,
  sealed,
  createdById,
  currentUserId,
  statements,
  canApprove,
  canWrite,
}: {
  runId: string;
  period: string;
  status: RoyaltyRunStatus;
  sealed: boolean;
  createdById: string | null;
  currentUserId: string;
  statements: StatementView[];
  canApprove: boolean;
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const isMaker = createdById != null && createdById === currentUserId;
  const totals = statements.reduce(
    (a, s) => ({
      earned: a.earned + s.earned,
      reserveHeld: a.reserveHeld + s.reserveHeld,
      reserveReleased: a.reserveReleased + s.reserveReleased,
      advanceRecouped: a.advanceRecouped + s.advanceRecouped,
      payable: a.payable + s.payable,
      netUnits: a.netUnits + s.netUnits,
    }),
    { earned: 0, reserveHeld: 0, reserveReleased: 0, advanceRecouped: 0, payable: 0, netUnits: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Status + maker-checker actions ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <StatusBadge status={status} />
        {sealed && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Lock className="size-4" /> {period} muhrlangan
            <InfoHint>
              Muhrlangan davrni qayta hisoblash ham, kesishuvchi davr ochish ham taqiqlangan — muallifga
              berilgan hisobot oʻzgarmasligi kerak.
            </InfoHint>
          </span>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {status === "DRAFT" && isMaker && (
            <span className="self-center text-xs text-muted-foreground">
              Oʻzingiz hisoblagan runni tasdiqlay olmaysiz
            </span>
          )}
          {status === "DRAFT" && canApprove && !isMaker && (
            <Button
              disabled={pending}
              onClick={() =>
                run(() => approveRoyaltyRunAction(runId), "Tasdiqlandi — davr muhrlandi")
              }
            >
              <Check className="size-4" /> Tasdiqlash
            </Button>
          )}
          {status === "APPROVED" && canWrite && (
            <Button
              disabled={pending}
              onClick={() => run(() => sendRoyaltyRunAction(runId), "Mualliflarga yuborildi")}
            >
              <Send className="size-4" /> Yuborish
            </Button>
          )}
        </div>
      </div>

      {/* ── Totals ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard title="Sof nusxa" value={formatNumber(totals.netUnits)} hint="Sotilgan − qaytgan" />
        <KpiCard
          title="Hisoblangan"
          value={formatUZS(totals.earned)}
          hint={
            <span className="inline-flex items-center gap-1">
              kumulyativ tier
              <InfoHint>
                Σ tier boʻyicha: qamrab olingan nusxa × asos (asosiy yoki sof narx) × stavka. Davr nusxalari
                shartnoma umri oʻqiga joylashadi.
              </InfoHint>
            </span>
          }
        />
        <KpiCard title="Ushlangan zaxira" value={formatUZS(totals.reserveHeld)} hint="Kelgusi davrda ochiladi" />
        <KpiCard title="Ochilgan zaxira" value={formatUZS(totals.reserveReleased)} hint="Oldingi davr zaxirasi, qaytishlar chegirilgan" />
        <KpiCard
          title="Toʻlanadigan"
          value={formatUZS(totals.payable)}
          hint={`Avansdan qoplangan: ${formatUZS(totals.advanceRecouped)}`}
        />
      </div>

      {/* ── Statement lines ────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Muallif / Asar</TableHead>
              <TableHead className="text-right">Sof nusxa</TableHead>
              <TableHead className="text-right">Oldin</TableHead>
              <TableHead className="text-right">Hisoblangan</TableHead>
              <TableHead className="text-right">Zaxira</TableHead>
              <TableHead className="text-right">Ochilgan</TableHead>
              <TableHead className="text-right">Avansdan</TableHead>
              <TableHead className="text-right">Toʻlanadigan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Bu davrda hisobot satri yoʻq — sotuv boʻlmagan yoki barcha shartnoma BUYOUT.
                </TableCell>
              </TableRow>
            )}
            {statements.map((s) => {
              const isOpen = expanded.has(s.id);
              return (
                <React.Fragment key={s.id}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(s.id)}>
                    <TableCell>
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{s.contributor}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.workTitle} · {s.contributorRole}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="flex flex-col">
                        <span>{formatNumber(s.netUnits)}</span>
                        {s.returnedUnits > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {formatNumber(s.unitsSold)} − {formatNumber(s.returnedUnits)}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(s.cumulativeBefore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUZS(s.earned)}</TableCell>
                    <TableCell className="text-right tabular-nums">−{formatUZS(s.reserveHeld)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.reserveReleased > 0 ? `+${formatUZS(s.reserveReleased)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.advanceRecouped > 0 ? `−${formatUZS(s.advanceRecouped)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatUZS(s.payable)}
                    </TableCell>
                  </TableRow>

                  {isOpen && s.detail && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/30">
                        <div className="flex flex-col gap-3 py-1">
                          {s.detail.byFormat.map((f) => (
                            <div key={f.format} className="flex flex-col gap-1">
                              <div className="text-sm font-medium">
                                {f.format} — {formatNumber(f.netUnits)} sof nusxa, oʻqda{" "}
                                {formatNumber(f.cumulativeBefore)} dan boshlanadi
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  asosiy {formatUZS(Number(f.listUnit))} · sof {formatUZS(Number(f.netUnit))}
                                </span>
                              </div>
                              <ul className="flex flex-col gap-0.5 text-xs">
                                {f.tiers.map((t, i) => (
                                  <li key={i} className="tabular-nums text-muted-foreground">
                                    • {t.explain}
                                  </li>
                                ))}
                              </ul>
                              {f.uncoveredUnits > 0 && (
                                <p className="text-xs text-destructive">
                                  ⚠ {formatNumber(f.uncoveredUnits)} nusxa hech qaysi tierga tushmadi — tier
                                  jadvalida uzilish bor.
                                </p>
                              )}
                            </div>
                          ))}

                          <div className={cn("border-t pt-2 text-xs text-muted-foreground")}>
                            Zaxira ulushi {(Number(s.detail.reserveRate) * 100).toFixed(0)}% ·
                            {" "}kechikkan qaytish taʼsiri {formatUZS(Number(s.detail.returnImpact))} ·
                            {" "}avansdan oldin {formatUZS(Number(s.detail.payableBefore))} ·
                            {" "}qolgan avans {formatUZS(s.advanceOutstanding)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
