import Decimal from "decimal.js";

/**
 * Pure inter-entity transfer helpers (spec v2 §5.2). The transferPrice is the
 * base price minus a SEALED per-line discount; the P_min floor check is reused
 * from lib/sales. The ledger nets RECEIVED transfers against internal
 * settlements per entity pair. All pure, unit-tested.
 *
 * Economic meaning: the publishing entity's profit ends at transferPrice; the
 * distribution entity's profit begins there (spec v2 §5.2, the M9 boundary).
 */

export type Num = Decimal.Value;

export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferError";
  }
}

/** transferPrice = basePrice × (1 − discountRate), rounded to whole soʻm. */
export function transferPrice(basePrice: Num, discountRate: Num): Decimal {
  const d = new Decimal(discountRate);
  if (d.lt(0) || d.gte(1)) throw new TransferError("Chegirma 0 va 1 orasida boʻlishi kerak");
  return new Decimal(basePrice).times(new Decimal(1).minus(d)).toDecimalPlaces(0);
}

export function transferLineTotal(transferPriceUnit: Num, qty: number): Decimal {
  if (qty <= 0) throw new TransferError("Miqdor 0 dan katta boʻlishi kerak");
  return new Decimal(transferPriceUnit).times(qty);
}

// ── Ledger netting ─────────────────────────────────────────────────────────────

export type ReceivedTransfer = { fromEntityId: string; toEntityId: string; amount: Num };
export type Settlement = { fromEntityId: string; toEntityId: string; amount: Num };

export type LedgerBalance = {
  /** creditor is owed by debtor. */
  creditorId: string;
  debtorId: string;
  amount: Decimal;
};

function pairKey(a: string, b: string): string {
  // Order-independent key so A→B and B→A land in the same bucket.
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Net every entity pair to a single directional balance.
 *
 * A RECEIVED transfer A→B means B owes A (B received goods worth `amount`).
 * A settlement A→B means A paid B, reducing what A owes B (or increasing what B
 * owes A). Balances net to zero collapse out. The result names who owes whom.
 */
export function nettedLedger(
  transfers: ReceivedTransfer[],
  settlements: Settlement[],
): LedgerBalance[] {
  // signed[key] > 0 means the lexicographically-smaller id is OWED by the larger.
  const signed = new Map<string, Decimal>();

  // The value SOURCE (`from`) always nets as the creditor: goods flowing A→B
  // make A a creditor; money flowing B→A make B a creditor, which offsets B's
  // debt. So transfers and settlements use the same rule.
  const add = (from: string, to: string, amount: Num) => {
    if (from === to) return;
    const key = pairKey(from, to);
    const [lo] = key.split("|");
    const signForLoCreditor = from === lo ? 1 : -1;
    const cur = signed.get(key) ?? new Decimal(0);
    signed.set(key, cur.plus(new Decimal(amount).times(signForLoCreditor)));
  };

  // Received A→B: goods left A → A is owed.
  for (const t of transfers) add(t.fromEntityId, t.toEntityId, t.amount);
  // Settlement A→B: cash left A (the debtor paying) → offsets A's debt.
  for (const s of settlements) add(s.fromEntityId, s.toEntityId, s.amount);

  const out: LedgerBalance[] = [];
  for (const [key, value] of signed) {
    if (value.isZero()) continue;
    const [lo, hi] = key.split("|");
    if (value.gt(0)) out.push({ creditorId: lo, debtorId: hi, amount: value });
    else out.push({ creditorId: hi, debtorId: lo, amount: value.abs() });
  }
  return out.sort((a, b) => b.amount.comparedTo(a.amount));
}
