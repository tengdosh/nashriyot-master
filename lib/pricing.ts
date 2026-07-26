import Decimal from "decimal.js";

/**
 * Pure dynamic-pricing engine (spec v1 §6.7). The AI service supplies the
 * elasticity; everything here — the demand curve, the revenue-maximising search,
 * the floor clamp, the "too small to bother" gate — is deterministic and
 * unit-tested. The result is a RECOMMENDATION; a human accepts it (§7 pattern).
 */

export type Num = Decimal.Value;

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/**
 * Constant-elasticity demand: qty = refQty · (price / refPrice)^elasticity.
 * Elasticity is normally negative (higher price → lower demand).
 */
export function demandAt(input: {
  price: Num;
  elasticity: Num;
  refPrice: Num;
  refQty: Num;
}): Decimal {
  const refPrice = new Decimal(input.refPrice);
  if (refPrice.lte(0)) throw new PricingError("refPrice 0 dan katta boʻlishi kerak");
  const ratio = new Decimal(input.price).div(refPrice);
  // Decimal has no pow(fractional); use JS Math on the ratio, then re-wrap.
  const demand = new Decimal(input.refQty).times(Math.pow(ratio.toNumber(), new Decimal(input.elasticity).toNumber()));
  return Decimal.max(demand, 0);
}

export type PriceSuggestion = {
  currentPrice: Decimal;
  suggestedPrice: Decimal;
  floorPrice: Decimal;
  expectedRevenueAtCurrent: Decimal;
  expectedRevenueAtSuggested: Decimal;
  uplift: Decimal; // suggested revenue ÷ current revenue − 1
  elasticity: Decimal;
  changed: boolean; // false when the move is below the significance threshold
  rationale: string;
};

const STEP = 0.05; // 5% grid (spec §6.7)
const MIN_CHANGE = 0.03; // ignore moves smaller than 3%
const CAP_MULTIPLE = 1.3; // search up to current × 1.3

/**
 * Search the price grid [floor … current×1.3] in 5% steps for the point that
 * maximises expected revenue price·demand(price), clamp to the floor, and return
 * null-equivalent (`changed=false`) when the optimum is within 3% of today's
 * price — not worth churning a price for.
 *
 * The floor is authoritative: a recommendation never dips below it, even if the
 * revenue curve wants to. (v2: floor = decision cost; until M12 the caller
 * passes the P_min floor.)
 */
export function suggestPrice(input: {
  currentPrice: Num;
  floorPrice: Num;
  elasticity: Num;
  refQty?: Num;
  capPrice?: Num | null;
}): PriceSuggestion {
  const current = new Decimal(input.currentPrice);
  const floor = new Decimal(input.floorPrice);
  const elasticity = new Decimal(input.elasticity);
  const refQty = new Decimal(input.refQty ?? 100);
  if (current.lte(0)) throw new PricingError("Joriy narx 0 dan katta boʻlishi kerak");

  const cap = input.capPrice != null ? new Decimal(input.capPrice) : current.times(CAP_MULTIPLE);
  const lo = Decimal.min(floor, current); // never let the floor exclude today's price from the search
  const hi = Decimal.max(cap, current);

  const revenueAt = (p: Decimal) =>
    p.times(demandAt({ price: p, elasticity, refPrice: current, refQty }));

  // Walk the grid as multiples of the current price so the step is meaningful.
  let best = current;
  let bestRev = revenueAt(current);
  const startMult = lo.div(current).toNumber();
  const endMult = hi.div(current).toNumber();
  for (let m = startMult; m <= endMult + 1e-9; m += STEP) {
    const p = current.times(m);
    if (p.lt(floor)) continue; // floor is hard
    const rev = revenueAt(p);
    // Require a real improvement (>0.01%) so sub-unit float noise on a flat
    // revenue curve (e ≈ −1) never nudges the recommendation off the current price.
    if (rev.gt(bestRev.times(1.0001))) {
      bestRev = rev;
      best = p;
    }
  }

  // Round to whole soʻm — prices are integers here, and it clears the float
  // overshoot the multiplicative grid leaves (e.g. 130000.00000000007).
  const suggested = Decimal.max(best, floor).toDecimalPlaces(0);
  const currentRev = revenueAt(current);
  const move = suggested.minus(current).abs().div(current);
  const changed = move.gte(MIN_CHANGE);
  const uplift = currentRev.gt(0) ? bestRev.div(currentRev).minus(1) : new Decimal(0);

  const direction = suggested.gt(current) ? "oshirish" : suggested.lt(current) ? "pasaytirish" : "oʻzgarishsiz";
  const rationale = changed
    ? `Elastiklik ${elasticity.toFixed(2)}: narxni ${direction} kutilgan tushumni ${(uplift.toNumber() * 100).toFixed(1)}% oshiradi. Pol: ${floor.toFixed(0)}.`
    : `Optimal narx joriydan 3% dan kam farq qiladi — oʻzgartirish tavsiya etilmaydi.`;

  return {
    currentPrice: current,
    suggestedPrice: suggested,
    floorPrice: floor,
    expectedRevenueAtCurrent: currentRev,
    expectedRevenueAtSuggested: bestRev,
    uplift,
    elasticity,
    changed,
    rationale,
  };
}

// ── Forecast confidence gate (spec §7.1: MAPE>40% → no auto-apply) ─────────────

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export const AUTO_APPLY_MAPE_LIMIT = 0.4;

/**
 * MAPE → confidence. A null MAPE (no comparable months) is LOW, not HIGH — the
 * absence of evidence must never read as strong evidence.
 */
export function forecastConfidence(mape: Num | null | undefined): {
  level: Confidence;
  canAutoApply: boolean;
} {
  if (mape == null) return { level: "LOW", canAutoApply: false };
  const m = new Decimal(mape);
  if (m.gt(AUTO_APPLY_MAPE_LIMIT)) return { level: "LOW", canAutoApply: false };
  if (m.gt(0.2)) return { level: "MEDIUM", canAutoApply: true };
  return { level: "HIGH", canAutoApply: true };
}

/** EOQ-style suggested reorder quantity from a forecast: sum of the horizon. */
export function forecastDemandTotal(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + Math.max(b, 0), 0));
}
