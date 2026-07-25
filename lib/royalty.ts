import Decimal from "decimal.js";

/**
 * Pure royalty engine — spec v1 §6.5. Determinism is the whole point: given the
 * same closed-period inputs this file must always produce byte-identical output,
 * because an author has already been shown the previous answer.
 *
 * The crux is that tiers are CUMULATIVE over the life of the contract, not
 * per-period. A period's units are placed at `cumulativeBefore` on the lifetime
 * axis and may span several tiers.
 */

export type Num = Decimal.Value;

export class RoyaltyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoyaltyError";
  }
}

export type RoyaltyBasisName = "LIST" | "NET";

export type TierInput = {
  id?: string;
  /** Null = applies to every format. */
  format?: string | null;
  fromUnits: number;
  /** Null = open-ended (the last tier). */
  toUnits?: number | null;
  rate: Num;
  basis?: RoyaltyBasisName;
};

// ── Tier table validation (spec §5.6: "kesishmaslik validatsiyasi") ───────────

export type TierProblem =
  | { kind: "NEGATIVE"; index: number }
  | { kind: "INVERTED"; index: number }
  | { kind: "OVERLAP"; index: number; previousIndex: number }
  | { kind: "GAP"; index: number; previousIndex: number; missingFrom: number; missingTo: number }
  | { kind: "OPEN_NOT_LAST"; index: number }
  | { kind: "EMPTY" };

/**
 * Tiers must tile the unit axis for each format: ascending, no overlap, no gap,
 * and only the final tier may be open-ended. Validation runs per format group,
 * so a HARDCOVER ladder and a PAPERBACK ladder are independent.
 */
export function validateTiers(tiers: TierInput[]): TierProblem[] {
  if (tiers.length === 0) return [{ kind: "EMPTY" }];

  const problems: TierProblem[] = [];
  const indexOf = new Map<TierInput, number>();
  tiers.forEach((t, i) => indexOf.set(t, i));

  const groups = new Map<string, TierInput[]>();
  for (const t of tiers) {
    const key = t.format ?? "__any__";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.fromUnits - b.fromUnits);
    let previous: TierInput | null = null;

    for (const t of sorted) {
      const i = indexOf.get(t)!;
      if (t.fromUnits < 0 || (t.toUnits != null && t.toUnits < 0)) {
        problems.push({ kind: "NEGATIVE", index: i });
        continue;
      }
      if (t.toUnits != null && t.toUnits < t.fromUnits) {
        problems.push({ kind: "INVERTED", index: i });
        continue;
      }
      if (previous) {
        const pi = indexOf.get(previous)!;
        if (previous.toUnits == null) {
          // An open-ended tier swallows everything after it.
          problems.push({ kind: "OPEN_NOT_LAST", index: pi });
        } else if (t.fromUnits <= previous.toUnits) {
          problems.push({ kind: "OVERLAP", index: i, previousIndex: pi });
        } else if (t.fromUnits > previous.toUnits + 1) {
          problems.push({
            kind: "GAP",
            index: i,
            previousIndex: pi,
            missingFrom: previous.toUnits + 1,
            missingTo: t.fromUnits - 1,
          });
        }
      }
      previous = t;
    }
  }

  return problems;
}

export function assertValidTiers(tiers: TierInput[]): void {
  const problems = validateTiers(tiers);
  if (problems.length > 0) {
    throw new RoyaltyError(`Tier jadvali xato: ${problems.map(describeTierProblem).join("; ")}`);
  }
}

export function describeTierProblem(p: TierProblem): string {
  switch (p.kind) {
    case "EMPTY":
      return "ROYALTY shartnomada kamida bitta tier kerak";
    case "NEGATIVE":
      return `${p.index + 1}-tier: manfiy nusxa soni`;
    case "INVERTED":
      return `${p.index + 1}-tier: yuqori chegara pastdan kichik`;
    case "OVERLAP":
      return `${p.index + 1}-tier ${p.previousIndex + 1}-tier bilan kesishadi`;
    case "GAP":
      return `${p.previousIndex + 1}- va ${p.index + 1}-tier orasida uzilish: ${p.missingFrom}–${p.missingTo}`;
    case "OPEN_NOT_LAST":
      return `${p.index + 1}-tier ochiq (yuqori chegarasiz), lekin oxirgi emas`;
  }
}

// ── Cumulative tier overlap ───────────────────────────────────────────────────

/**
 * How many of the units in the half-open lifetime window [from, to) fall inside
 * a tier. Tier bounds are INCLUSIVE unit indices (`fromUnits`..`toUnits`), which
 * is how a contract reads: "copies 1–3 000 at 8%".
 *
 * Using a half-open window is what makes consecutive periods join seamlessly:
 * period 1 covers [0, 3000) and period 2 continues at [3000, …).
 */
export function tierOverlap(from: number, to: number, tier: TierInput): number {
  if (to <= from) return 0;
  const tierStart = tier.fromUnits;
  const tierEnd = tier.toUnits == null ? Infinity : tier.toUnits + 1; // exclusive
  const lo = Math.max(from, tierStart);
  const hi = Math.min(to, tierEnd);
  return Math.max(hi - lo, 0);
}

export type TierLine = {
  tierId: string | null;
  tierIndex: number;
  fromUnits: number;
  toUnits: number | null;
  units: number;
  basis: RoyaltyBasisName;
  /** The per-copy base the rate was applied to (list or sealed net). */
  baseUnit: Decimal;
  rate: Decimal;
  amount: Decimal;
};

export type EarnedResult = {
  earned: Decimal;
  lines: TierLine[];
  /** Units the tiers did NOT cover — non-zero means the ladder has a hole. */
  uncoveredUnits: number;
};

/**
 * earned = Σ over tiers: overlap(prevCum, prevCum+netUnits, tier) × base × rate
 *
 * `basis` decides the base per tier: LIST uses the cover price, NET uses the
 * SEALED net unit from M6 (never a recomputation). Only tiers matching the
 * format (or format-agnostic tiers) participate.
 */
export function earnedByTier(input: {
  cumulativeBefore: number;
  netUnits: number;
  tiers: TierInput[];
  format?: string | null;
  listUnit: Num;
  netUnit: Num;
}): EarnedResult {
  if (input.netUnits < 0) throw new RoyaltyError("netUnits manfiy boʻlishi mumkin emas");
  if (input.cumulativeBefore < 0) throw new RoyaltyError("cumulativeBefore manfiy boʻlishi mumkin emas");

  const from = input.cumulativeBefore;
  const to = input.cumulativeBefore + input.netUnits;

  const applicable = input.tiers
    .map((t, i) => ({ tier: t, index: i }))
    .filter(({ tier }) => tier.format == null || tier.format === input.format)
    .sort((a, b) => a.tier.fromUnits - b.tier.fromUnits);

  const lines: TierLine[] = [];
  let earned = new Decimal(0);
  let covered = 0;

  for (const { tier, index } of applicable) {
    const units = tierOverlap(from, to, tier);
    if (units === 0) continue;
    const basis: RoyaltyBasisName = tier.basis ?? "LIST";
    const baseUnit = new Decimal(basis === "LIST" ? input.listUnit : input.netUnit);
    const rate = new Decimal(tier.rate);
    const amount = baseUnit.times(rate).times(units);

    covered += units;
    earned = earned.plus(amount);
    lines.push({
      tierId: tier.id ?? null,
      tierIndex: index,
      fromUnits: tier.fromUnits,
      toUnits: tier.toUnits ?? null,
      units,
      basis,
      baseUnit,
      rate,
      amount,
    });
  }

  return { earned, lines, uncoveredUnits: input.netUnits - covered };
}

// ── Reserve, advance recoup, payable (spec §6.5) ───────────────────────────────

export type StatementResult = {
  netUnits: number;
  earned: Decimal;
  reserveHeld: Decimal;
  reserveReleased: Decimal;
  payableBefore: Decimal;
  advanceRecouped: Decimal;
  advanceOutstandingAfter: Decimal;
  payable: Decimal;
  lines: TierLine[];
  uncoveredUnits: number;
};

/**
 * The full per-contract statement for one period.
 *
 *   reserveHeld  = earned × reserveRate                (held against future returns)
 *   released     = prevReserve − actualReturnImpact    (last period's hold, freed)
 *   payableBefore= earned − reserveHeld + released
 *   recoup       = min(payableBefore, advanceOutstanding)
 *   payable      = payableBefore − recoup
 *
 * `released` is floored at zero: if last period's returns cost more than we held
 * back, the shortfall is NOT clawed back out of this period's earnings — the
 * publisher absorbs it. Clawing back would make an author's paid statement
 * retroactively wrong, which is exactly what the reserve exists to prevent.
 *
 * `payable` is floored at zero for the same reason — a period never bills the
 * author. Any negative remainder simply leaves the advance outstanding.
 */
export function buildStatement(input: {
  cumulativeBefore: number;
  unitsSold: number;
  returnedUnits: number;
  tiers: TierInput[];
  format?: string | null;
  listUnit: Num;
  netUnit: Num;
  reserveRate: Num;
  previousReserveHeld?: Num;
  actualReturnImpact?: Num;
  advanceOutstanding?: Num;
}): StatementResult {
  const reserveRate = new Decimal(input.reserveRate);
  if (reserveRate.lt(0) || reserveRate.gte(1)) {
    throw new RoyaltyError("Zaxira ulushi 0 va 1 orasida boʻlishi kerak");
  }
  if (input.returnedUnits > input.unitsSold) {
    throw new RoyaltyError("Qaytgan nusxa sotilgandan koʻp boʻlishi mumkin emas");
  }

  const netUnits = input.unitsSold - input.returnedUnits;
  const { earned, lines, uncoveredUnits } = earnedByTier({
    cumulativeBefore: input.cumulativeBefore,
    netUnits,
    tiers: input.tiers,
    format: input.format,
    listUnit: input.listUnit,
    netUnit: input.netUnit,
  });

  const reserveHeld = earned.times(reserveRate);
  const rawReleased = new Decimal(input.previousReserveHeld ?? 0).minus(input.actualReturnImpact ?? 0);
  const reserveReleased = Decimal.max(rawReleased, 0);

  const payableBefore = earned.minus(reserveHeld).plus(reserveReleased);
  const advanceOutstanding = new Decimal(input.advanceOutstanding ?? 0);
  const advanceRecouped = Decimal.min(Decimal.max(payableBefore, 0), advanceOutstanding);
  const payable = Decimal.max(payableBefore.minus(advanceRecouped), 0);

  return {
    netUnits,
    earned,
    reserveHeld,
    reserveReleased,
    payableBefore,
    advanceRecouped,
    advanceOutstandingAfter: advanceOutstanding.minus(advanceRecouped),
    payable,
    lines,
    uncoveredUnits,
  };
}

// ── Period helpers (determinism: only CLOSED periods may be run) ──────────────

export type PeriodWindow = { period: string; start: Date; end: Date };

/**
 * Parse "2026-H1" / "2026-H2" / "2026-Q3" / "2026-M07" into a UTC window.
 * `end` is the last instant of the period, so a closed-period query is
 * `shippedDate >= start AND shippedDate <= end`.
 */
export function parsePeriod(period: string): PeriodWindow {
  const m = /^(\d{4})-(H[12]|Q[1-4]|M(0[1-9]|1[0-2]))$/.exec(period);
  if (!m) {
    throw new RoyaltyError(`Davr formati notoʻgʻri: ${period} (masalan 2026-H1, 2026-Q3, 2026-M07)`);
  }
  const year = Number(m[1]);
  const code = m[2];

  let startMonth: number;
  let months: number;
  if (code.startsWith("H")) {
    startMonth = (Number(code[1]) - 1) * 6;
    months = 6;
  } else if (code.startsWith("Q")) {
    startMonth = (Number(code[1]) - 1) * 3;
    months = 3;
  } else {
    startMonth = Number(code.slice(1)) - 1;
    months = 1;
  }

  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + months, 1, 0, 0, 0, 0) - 1);
  return { period, start, end };
}

/** A period may only be run once it is over — mid-period numbers are not final. */
export function isPeriodClosed(window: PeriodWindow, now: Date = new Date()): boolean {
  return window.end.getTime() < now.getTime();
}

export function assertPeriodClosed(window: PeriodWindow, now: Date = new Date()): void {
  if (!isPeriodClosed(window, now)) {
    throw new RoyaltyError(
      `${window.period} davri hali yopilmagan — royalti faqat yopilgan davr uchun hisoblanadi`,
    );
  }
}

/** Human-readable explanation of one tier line, for the statement and preview. */
export function explainTierLine(line: TierLine): string {
  const range =
    line.toUnits == null ? `${line.fromUnits + 1}+` : `${line.fromUnits + 1}–${line.toUnits + 1}`;
  const basis = line.basis === "LIST" ? "asosiy narx" : "sof narx";
  return `${range} nusxa oraligʻi: ${line.units} dona × ${basis} ${line.baseUnit.toFixed(0)} × ${line.rate.times(100).toFixed(1)}% = ${line.amount.toFixed(0)}`;
}
