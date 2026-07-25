import Decimal from "decimal.js";
import { contributionMargin, minViablePrice } from "./finance";

/**
 * Pure sales engine — spec v1 §5.5/§6.4 and v2 §7.3.
 *
 * Two rules drive everything here:
 *   1. A discount is SEALED on the line at save time. Changing a rule later must
 *      never move a historic document, so nothing in this file reads "current"
 *      state — callers pass the rates they sealed.
 *   2. CM is computed once, at ship, from the sealed inputs (§6.4).
 */

export type Num = Decimal.Value;

export class SalesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesError";
  }
}

// ── Discount rule engine (v2 §7.3) ────────────────────────────────────────────

export type DiscountScopeName = "PARTNER" | "VOLUME" | "TITLE" | "ENTITY" | "DEFAULT";

export type DiscountRuleInput = {
  id?: string;
  scope: DiscountScopeName;
  refId?: string | null;
  minQty?: number | null;
  rate: Num;
  priority?: number;
  isActive?: boolean;
};

export type DiscountSuggestion = {
  rate: Decimal;
  source: DiscountScopeName | "NONE";
  ruleId: string | null;
};

/** Scope precedence — first match wins, most specific first. */
export const DISCOUNT_PRECEDENCE: DiscountScopeName[] = [
  "PARTNER",
  "VOLUME",
  "TITLE",
  "ENTITY",
  "DEFAULT",
];

function ruleMatches(
  rule: DiscountRuleInput,
  ctx: { partnerId?: string | null; titleId?: string | null; entityId?: string | null; qty: number },
): boolean {
  if (rule.isActive === false) return false;
  switch (rule.scope) {
    case "PARTNER":
      return !!ctx.partnerId && rule.refId === ctx.partnerId;
    case "VOLUME":
      return rule.minQty != null && ctx.qty >= rule.minQty;
    case "TITLE":
      return !!ctx.titleId && rule.refId === ctx.titleId;
    case "ENTITY":
      return !!ctx.entityId && rule.refId === ctx.entityId;
    case "DEFAULT":
      return true;
  }
}

/**
 * Pick the discount for one line: walk the scope ladder and, inside a scope,
 * take the highest `priority` (then the highest rate) among matching rules. The
 * chosen source is returned so the UI can show WHERE the number came from — the
 * spec requires that, otherwise a discount is unexplainable to the salesperson.
 */
export function suggestDiscount(
  rules: DiscountRuleInput[],
  ctx: { partnerId?: string | null; titleId?: string | null; entityId?: string | null; qty: number },
): DiscountSuggestion {
  for (const scope of DISCOUNT_PRECEDENCE) {
    const matches = rules.filter((r) => r.scope === scope && ruleMatches(r, ctx));
    if (matches.length === 0) continue;
    const best = matches.reduce((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pb > pa) return b;
      if (pb < pa) return a;
      return new Decimal(b.rate).gt(a.rate) ? b : a;
    });
    return { rate: new Decimal(best.rate), source: scope, ruleId: best.id ?? null };
  }
  return { rate: new Decimal(0), source: "NONE", ruleId: null };
}

// ── Line economics (v1 §6.4) ──────────────────────────────────────────────────

export type LineInput = {
  qty: number;
  unitPrice: Num;
  discountRate: Num;
  /** Channel fee as a RATE of the discounted price (marketplace commission). */
  channelFeeRate?: Num;
  cogsUnit?: Num | null;
  royaltyEstUnit?: Num;
  deliveryCostUnit?: Num;
};

export type LineEconomics = {
  grossUnit: Decimal; // list price before discount
  netUnit: Decimal; // after discount AND channel fee — the money we actually get
  channelFeeUnit: Decimal;
  cogsUnit: Decimal;
  cmUnit: Decimal;
  grossTotal: Decimal;
  netTotal: Decimal;
  cmTotal: Decimal;
};

/**
 * net = unitPrice × (1 − discount) − channelFee
 * CM  = net − cogsUnit − royaltyEst − shippingPerUnit
 *
 * Before ship there is no COGS yet, so `cogsUnit` may be null — CM is then the
 * pre-COGS contribution, and callers must not seal it.
 */
export function lineEconomics(line: LineInput): LineEconomics {
  if (line.qty <= 0) throw new SalesError("Qator miqdori 0 dan katta boʻlishi kerak");
  const discount = new Decimal(line.discountRate);
  if (discount.lt(0) || discount.gte(1)) {
    throw new SalesError("Chegirma 0 va 1 orasida boʻlishi kerak");
  }

  const grossUnit = new Decimal(line.unitPrice);
  const discounted = grossUnit.times(new Decimal(1).minus(discount));
  const channelFeeUnit = discounted.times(line.channelFeeRate ?? 0);
  const cogsUnit = new Decimal(line.cogsUnit ?? 0);

  const cmUnit = contributionMargin({
    unitPrice: grossUnit,
    discountRate: discount,
    cogsUnit,
    channelFee: channelFeeUnit,
    royaltyEst: line.royaltyEstUnit ?? 0,
    shippingPerUnit: line.deliveryCostUnit ?? 0,
  });

  const netUnit = discounted.minus(channelFeeUnit);
  return {
    grossUnit,
    netUnit,
    channelFeeUnit,
    cogsUnit,
    cmUnit,
    grossTotal: grossUnit.times(line.qty),
    netTotal: netUnit.times(line.qty),
    cmTotal: cmUnit.times(line.qty),
  };
}

export type OrderTotals = {
  gross: Decimal;
  net: Decimal;
  cm: Decimal;
  cogs: Decimal;
  units: number;
  /** CM ÷ net, 0 when there is no revenue. */
  cmRate: Decimal;
};

export function orderTotals(lines: LineInput[]): OrderTotals {
  const zero = new Decimal(0);
  const acc = lines.reduce(
    (a, l) => {
      const e = lineEconomics(l);
      return {
        gross: a.gross.plus(e.grossTotal),
        net: a.net.plus(e.netTotal),
        cm: a.cm.plus(e.cmTotal),
        cogs: a.cogs.plus(e.cogsUnit.times(l.qty)),
        units: a.units + l.qty,
      };
    },
    { gross: zero, net: zero, cm: zero, cogs: zero, units: 0 },
  );
  return { ...acc, cmRate: acc.net.gt(0) ? acc.cm.div(acc.net) : zero };
}

// ── P_min floor (spec §3.3: enforced wherever a price/discount is set) ────────

export type PMinCheck = {
  pMin: Decimal;
  effectivePrice: Decimal;
  violated: boolean;
  shortfall: Decimal;
};

/**
 * P_min = uc / (1 − discount − royalty) — the minimum LIST price that still
 * covers unit cost once this line's discount and the royalty are taken out
 * (spec §6.1). A violation is a hard red block in the UI; only an admin override
 * may pass it, and the override is audited.
 *
 * `discount + royalty >= 1` gives no viable price at all — finance throws, and
 * that is reported as a violation with an infinite floor rather than a crash.
 */
export function checkPMin(input: {
  unitPrice: Num;
  discountRate: Num;
  unitCost: Num;
  royaltyRate?: Num;
}): PMinCheck {
  const unitPrice = new Decimal(input.unitPrice);
  const effectivePrice = unitPrice.times(new Decimal(1).minus(input.discountRate));

  let pMin: Decimal;
  try {
    pMin = minViablePrice({
      uc: input.unitCost,
      discountRate: input.discountRate,
      royaltyRate: input.royaltyRate ?? 0,
    });
  } catch {
    // Chegirma + royalti ≥ 100% — hech qanday narx qoplamaydi.
    return {
      pMin: new Decimal(Infinity),
      effectivePrice,
      violated: true,
      shortfall: new Decimal(Infinity),
    };
  }

  const violated = unitPrice.lt(pMin);
  return {
    pMin,
    effectivePrice,
    violated,
    shortfall: violated ? pMin.minus(unitPrice) : new Decimal(0),
  };
}

// ── Credit limit (v2 §6: checked at CONFIRMED) ─────────────────────────────────

export type CreditCheck = {
  limit: Decimal | null;
  outstanding: Decimal;
  orderValue: Decimal;
  headroom: Decimal | null;
  exceeded: boolean;
};

/**
 * A partner with no limit set is unlimited (null), not zero — treating a missing
 * limit as zero would block every first order.
 */
export function checkCreditLimit(input: {
  creditLimit?: Num | null;
  outstandingUZS: Num;
  orderValueUZS: Num;
  isBlocked?: boolean;
}): CreditCheck {
  const outstanding = new Decimal(input.outstandingUZS);
  const orderValue = new Decimal(input.orderValueUZS);
  if (input.creditLimit == null) {
    return {
      limit: null,
      outstanding,
      orderValue,
      headroom: null,
      exceeded: !!input.isBlocked,
    };
  }
  const limit = new Decimal(input.creditLimit);
  const headroom = limit.minus(outstanding);
  return {
    limit,
    outstanding,
    orderValue,
    headroom,
    exceeded: !!input.isBlocked || orderValue.gt(headroom),
  };
}

// ── AR aging (v1 §5.5) ────────────────────────────────────────────────────────

export type AgingBucket = "CURRENT" | "D0_30" | "D31_60" | "D61_90" | "D90_PLUS";

export const AGING_BUCKETS: AgingBucket[] = ["CURRENT", "D0_30", "D31_60", "D61_90", "D90_PLUS"];

export const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: "Muddati kelmagan",
  D0_30: "0–30 kun",
  D31_60: "31–60 kun",
  D61_90: "61–90 kun",
  D90_PLUS: "90+ kun",
};

/** Days past due → bucket. Not yet due (or no due date) is CURRENT, not 0–30. */
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "CURRENT";
  if (daysOverdue <= 30) return "D0_30";
  if (daysOverdue <= 60) return "D31_60";
  if (daysOverdue <= 90) return "D61_90";
  return "D90_PLUS";
}

export function daysOverdue(dueDate: Date | null | undefined, now: Date = new Date()): number {
  if (!dueDate) return 0;
  return Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
}

export type AgingRow = { outstandingUZS: Num; dueDate: Date | null };

export type AgingSummary = {
  buckets: Record<AgingBucket, Decimal>;
  total: Decimal;
  overdue: Decimal; // everything past due, i.e. total − CURRENT
};

export function agingSummary(rows: AgingRow[], now: Date = new Date()): AgingSummary {
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, new Decimal(0)])) as Record<
    AgingBucket,
    Decimal
  >;
  let total = new Decimal(0);
  for (const r of rows) {
    const amount = new Decimal(r.outstandingUZS);
    if (amount.lte(0)) continue; // settled rows never appear in aging
    const b = agingBucket(daysOverdue(r.dueDate, now));
    buckets[b] = buckets[b].plus(amount);
    total = total.plus(amount);
  }
  return { buckets, total, overdue: total.minus(buckets.CURRENT) };
}

// ── Channel KPI (v2 §6: marketplace is judged on NET) ─────────────────────────

export type ChannelKpi = {
  gross: Decimal;
  net: Decimal;
  cm: Decimal;
  units: number;
  cmRate: Decimal;
  /** Marketplaces must be compared on NET, never on gross turnover. */
  headlineMetric: "NET" | "GROSS";
};

export function channelKpi(
  channelType: "RETAIL" | "MARKETPLACE" | "DISTRIBUTOR" | "OWN_STORE",
  lines: LineInput[],
): ChannelKpi {
  const t = orderTotals(lines);
  return {
    gross: t.gross,
    net: t.net,
    cm: t.cm,
    units: t.units,
    cmRate: t.cmRate,
    headlineMetric: channelType === "MARKETPLACE" ? "NET" : "GROSS",
  };
}

// ── Net sales for a period (returns reduce it — v1 §5.5) ──────────────────────

/**
 * Period net sales = shipped units × net unit − returned units × net unit.
 * Returns are valued at the SEALED net of the line they came back from, so a
 * later price change cannot retroactively alter a period that is already closed.
 */
export function netSales(
  lines: { qty: number; returnedQty: number; netUnit: Num }[],
): { units: number; returnedUnits: number; netUnits: number; revenue: Decimal } {
  let units = 0;
  let returnedUnits = 0;
  let revenue = new Decimal(0);
  for (const l of lines) {
    units += l.qty;
    returnedUnits += l.returnedQty;
    revenue = revenue.plus(new Decimal(l.netUnit).times(l.qty - l.returnedQty));
  }
  return { units, returnedUnits, netUnits: units - returnedUnits, revenue };
}
