import Decimal from "decimal.js";

/**
 * Pure finance-centre helpers (spec v2 §5.4): cash position, weekly cash flow
 * and bank reconciliation auto-matching. Pure and unit-tested; the service
 * feeds them rows read from payments / bank input.
 */

export type Num = Decimal.Value;
export type Direction = "IN" | "OUT";

export type PaymentRow = { entityId: string; direction: Direction; amount: Num; date: Date };

/** Net cash per entity = Σ IN − Σ OUT. */
export function cashByEntity(payments: PaymentRow[]): Map<string, Decimal> {
  const out = new Map<string, Decimal>();
  for (const p of payments) {
    const cur = out.get(p.entityId) ?? new Decimal(0);
    const signed = new Decimal(p.amount).times(p.direction === "IN" ? 1 : -1);
    out.set(p.entityId, cur.plus(signed));
  }
  return out;
}

/** ISO-8601 week key "YYYY-Www" (Monday-based). */
export function isoWeekKey(date: Date): string {
  // Copy to UTC midnight to avoid DST drift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week decides the ISO year.
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type WeekFlow = { week: string; in: Decimal; out: Decimal; net: Decimal };

/** Bucket payments by ISO week into in/out/net, chronological. */
export function cashFlowByWeek(payments: PaymentRow[]): WeekFlow[] {
  const byWeek = new Map<string, { in: Decimal; out: Decimal }>();
  for (const p of payments) {
    const key = isoWeekKey(p.date);
    const e = byWeek.get(key) ?? { in: new Decimal(0), out: new Decimal(0) };
    if (p.direction === "IN") e.in = e.in.plus(p.amount);
    else e.out = e.out.plus(p.amount);
    byWeek.set(key, e);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, e]) => ({ week, in: e.in, out: e.out, net: e.in.minus(e.out) }));
}

// ── Bank reconciliation ────────────────────────────────────────────────────────

export type PendingPayment = { id: string; partnerId: string | null; amount: Num; date: Date };
export type BankRow = { ref: string; partnerId: string | null; amount: Num; date: Date };

export type ReconResult = {
  matches: { paymentId: string; bankRef: string }[];
  unmatchedPayments: string[]; // payment ids
  unmatchedBank: string[]; // bank refs
};

/**
 * Auto-match pending payments to bank rows: same amount (within `amountTol`),
 * date within `days`, and same partner. Greedy one-to-one — a bank row and a
 * payment each match at most once. Whatever is left is reported for manual
 * pairing (spec v2 §5.4).
 */
export function reconAutoMatch(
  pending: PendingPayment[],
  bank: BankRow[],
  opts: { days?: number; amountTol?: Num } = {},
): ReconResult {
  const days = opts.days ?? 2;
  const tol = new Decimal(opts.amountTol ?? 0);
  const usedBank = new Set<string>();
  const matches: { paymentId: string; bankRef: string }[] = [];
  const matchedPayments = new Set<string>();

  for (const p of pending) {
    const pAmt = new Decimal(p.amount);
    const hit = bank.find((b) => {
      if (usedBank.has(b.ref)) return false;
      if ((p.partnerId ?? null) !== (b.partnerId ?? null)) return false;
      if (pAmt.minus(b.amount).abs().gt(tol)) return false;
      const dayGap = Math.abs(p.date.getTime() - b.date.getTime()) / 86_400_000;
      return dayGap <= days;
    });
    if (hit) {
      usedBank.add(hit.ref);
      matchedPayments.add(p.id);
      matches.push({ paymentId: p.id, bankRef: hit.ref });
    }
  }

  return {
    matches,
    unmatchedPayments: pending.filter((p) => !matchedPayments.has(p.id)).map((p) => p.id),
    unmatchedBank: bank.filter((b) => !usedBank.has(b.ref)).map((b) => b.ref),
  };
}

/** Total of a signed money column, for a difference report. */
export function sum(values: Num[]): Decimal {
  return values.reduce((a: Decimal, v) => a.plus(v), new Decimal(0));
}
