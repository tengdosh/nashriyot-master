"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatNumber, formatUZS } from "@/lib/format";

type TierDetail = { range: string; units: number; basis: string; explain: string };
type ByFormat = { format: string; netUnits: number; tiers: TierDetail[] };

export type StatementCard = {
  id: string;
  period: string;
  workTitle: string;
  netUnits: number;
  earned: number;
  reserveHeld: number;
  reserveReleased: number;
  advanceRecouped: number;
  payable: number;
  sentAt: string | null;
  detail: unknown;
  downloadToken: string;
};

export function StatementsList({ cards }: { cards: StatementCard[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border bg-background py-12 text-center text-sm text-muted-foreground">
        Hali yuborilgan hisobot yoʻq.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((c) => {
        const isOpen = open.has(c.id);
        const byFormat = ((c.detail as { byFormat?: ByFormat[] } | null)?.byFormat ?? []) as ByFormat[];
        return (
          <div key={c.id} className="rounded-lg border bg-background">
            <button
              type="button"
              onClick={() => toggle(c.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {c.period}
                  <StatusBadge status="SENT" tone="success" label="Yuborilgan" />
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.workTitle} · {formatNumber(c.netUnits)} sof nusxa
                  {c.sentAt && ` · ${formatDate(c.sentAt)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatUZS(c.payable)}</div>
                <div className="text-xs text-muted-foreground">toʻlangan</div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-4 py-3">
                <div className="grid gap-2 text-sm sm:grid-cols-4">
                  <Figure label="Hisoblangan" value={c.earned} />
                  <Figure label="Ushlangan zaxira" value={-c.reserveHeld} />
                  <Figure label="Ochilgan zaxira" value={c.reserveReleased} />
                  <Figure label="Avansdan qoplangan" value={-c.advanceRecouped} />
                </div>

                {byFormat.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {byFormat.map((f) => (
                      <div key={f.format} className="text-xs">
                        <div className="font-medium">
                          {f.format} — {formatNumber(f.netUnits)} sof nusxa
                        </div>
                        <ul className="mt-0.5 flex flex-col gap-0.5 text-muted-foreground">
                          {f.tiers.map((t, i) => (
                            <li key={i} className="tabular-nums">
                              • {t.explain}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`/api/portal/statements/${c.id}/report?token=${encodeURIComponent(c.downloadToken)}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <Download className="size-4" /> Hisobotni yuklab olish
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums">{formatUZS(value)}</div>
    </div>
  );
}
