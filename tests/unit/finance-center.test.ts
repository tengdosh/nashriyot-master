import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  cashByEntity,
  isoWeekKey,
  cashFlowByWeek,
  reconAutoMatch,
  sum,
  type PaymentRow,
  type PendingPayment,
  type BankRow,
} from "@/lib/finance-center";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("cashByEntity", () => {
  it("nets IN minus OUT per entity and aggregates repeats", () => {
    const rows: PaymentRow[] = [
      { entityId: "A", direction: "IN", amount: 100, date: d("2026-01-01") },
      { entityId: "A", direction: "OUT", amount: 30, date: d("2026-01-02") },
      { entityId: "B", direction: "IN", amount: 50, date: d("2026-01-03") },
    ];
    const m = cashByEntity(rows);
    expect(m.get("A")!.toString()).toBe("70");
    expect(m.get("B")!.toString()).toBe("50");
  });

  it("returns empty map for no rows", () => {
    expect(cashByEntity([]).size).toBe(0);
  });
});

describe("isoWeekKey", () => {
  it("labels the first ISO week", () => {
    expect(isoWeekKey(d("2026-01-01"))).toBe("2026-W01");
  });
  it("labels a two-digit week at year end", () => {
    expect(isoWeekKey(d("2026-12-31"))).toBe("2026-W53");
  });
  it("assigns a January date to the prior ISO year", () => {
    // 2027-01-01 is a Friday → belongs to ISO week 53 of 2026.
    expect(isoWeekKey(d("2027-01-01"))).toBe("2026-W53");
  });
});

describe("cashFlowByWeek", () => {
  it("buckets in/out/net by ISO week, chronological", () => {
    const rows: PaymentRow[] = [
      // insertion order W02, W01, W03 exercises the sort comparator both ways
      { entityId: "A", direction: "IN", amount: 500, date: d("2026-01-05") }, // W02
      { entityId: "A", direction: "IN", amount: 100, date: d("2026-01-06") }, // W02
      { entityId: "A", direction: "IN", amount: 900, date: d("2026-01-01") }, // W01
      { entityId: "A", direction: "OUT", amount: 200, date: d("2026-01-12") }, // W03
    ];
    const weeks = cashFlowByWeek(rows);
    expect(weeks.map((w) => w.week)).toEqual(["2026-W01", "2026-W02", "2026-W03"]);
    expect(weeks[0].net.toString()).toBe("900");
    expect(weeks[1].in.toString()).toBe("600");
    expect(weeks[1].out.toString()).toBe("0");
    expect(weeks[1].net.toString()).toBe("600");
    expect(weeks[2].in.toString()).toBe("0");
    expect(weeks[2].out.toString()).toBe("200");
    expect(weeks[2].net.toString()).toBe("-200");
  });

  it("returns empty for no payments", () => {
    expect(cashFlowByWeek([])).toEqual([]);
  });
});

describe("reconAutoMatch", () => {
  const pending: PendingPayment[] = [
    { id: "p1", partnerId: "X", amount: 1000, date: d("2026-03-10") },
    { id: "p2", partnerId: "Y", amount: 500, date: d("2026-03-11") },
    { id: "p3", partnerId: null, amount: 250, date: d("2026-03-12") },
  ];

  it("matches on partner + amount + date window (defaults)", () => {
    const bank: BankRow[] = [
      { ref: "b1", partnerId: "X", amount: 1000, date: d("2026-03-11") },
      { ref: "b2", partnerId: null, amount: 250, date: d("2026-03-12") },
    ];
    const r = reconAutoMatch(pending, bank);
    expect(r.matches).toEqual([
      { paymentId: "p1", bankRef: "b1" },
      { paymentId: "p3", bankRef: "b2" },
    ]);
    expect(r.unmatchedPayments).toEqual(["p2"]);
    expect(r.unmatchedBank).toEqual([]);
  });

  it("rejects a partner mismatch and a date too far away", () => {
    const bank: BankRow[] = [
      { ref: "b1", partnerId: "Z", amount: 1000, date: d("2026-03-10") }, // wrong partner
      { ref: "b2", partnerId: "Y", amount: 500, date: d("2026-03-20") }, // too far in time
    ];
    const r = reconAutoMatch(pending, bank);
    expect(r.matches).toEqual([]);
    expect(r.unmatchedPayments).toEqual(["p1", "p2", "p3"]);
    expect(r.unmatchedBank).toEqual(["b1", "b2"]);
  });

  it("honours amount tolerance and a wider day window", () => {
    const bank: BankRow[] = [
      { ref: "b1", partnerId: "X", amount: 1001, date: d("2026-03-14") },
    ];
    // tol 0 / days 2 → no match; tol 1 / days 4 → match
    expect(reconAutoMatch(pending, bank).matches).toEqual([]);
    const r = reconAutoMatch(pending, bank, { amountTol: 1, days: 4 });
    expect(r.matches).toEqual([{ paymentId: "p1", bankRef: "b1" }]);
  });

  it("is one-to-one: a used bank row is not matched twice", () => {
    const twoSame: PendingPayment[] = [
      { id: "p1", partnerId: "X", amount: 1000, date: d("2026-03-10") },
      { id: "p2", partnerId: "X", amount: 1000, date: d("2026-03-10") },
    ];
    const bank: BankRow[] = [
      { ref: "b1", partnerId: "X", amount: 1000, date: d("2026-03-10") },
    ];
    const r = reconAutoMatch(twoSame, bank);
    expect(r.matches).toEqual([{ paymentId: "p1", bankRef: "b1" }]);
    expect(r.unmatchedPayments).toEqual(["p2"]);
  });
});

describe("sum", () => {
  it("adds decimal values", () => {
    expect(sum([100, "50.5", new Decimal(0.25)]).toString()).toBe("150.75");
  });
  it("is zero for empty", () => {
    expect(sum([]).toString()).toBe("0");
  });
});
