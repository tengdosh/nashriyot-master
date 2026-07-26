import { describe, it, expect } from "vitest";
import { transferPrice, transferLineTotal, nettedLedger, TransferError } from "@/lib/transfer";

describe("transferPrice", () => {
  it("is base × (1 − discount), rounded to whole soʻm", () => {
    expect(transferPrice(100_000, 0.45).toNumber()).toBe(55_000);
    expect(transferPrice(217_400, 0.3).toNumber()).toBe(152_180);
    expect(transferPrice(100_000, 0).toNumber()).toBe(100_000);
  });
  it("rejects an out-of-range discount", () => {
    expect(() => transferPrice(100, -0.1)).toThrow(TransferError);
    expect(() => transferPrice(100, 1)).toThrow(TransferError);
  });
});

describe("transferLineTotal", () => {
  it("multiplies unit by qty", () => {
    expect(transferLineTotal(55_000, 100).toNumber()).toBe(5_500_000);
  });
  it("rejects non-positive qty", () => {
    expect(() => transferLineTotal(55_000, 0)).toThrow(TransferError);
  });
});

describe("nettedLedger", () => {
  it("a single received transfer: receiver owes sender", () => {
    const l = nettedLedger([{ fromEntityId: "A", toEntityId: "B", amount: 1_000_000 }], []);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ creditorId: "A", debtorId: "B" });
    expect(l[0].amount.toNumber()).toBe(1_000_000);
  });

  it("a settlement from the debtor reduces the balance", () => {
    const l = nettedLedger(
      [{ fromEntityId: "A", toEntityId: "B", amount: 1_000_000 }],
      [{ fromEntityId: "B", toEntityId: "A", amount: 400_000 }], // B pays A back
    );
    expect(l[0]).toMatchObject({ creditorId: "A", debtorId: "B" });
    expect(l[0].amount.toNumber()).toBe(600_000);
  });

  it("a fully-paid balance collapses out", () => {
    const l = nettedLedger(
      [{ fromEntityId: "A", toEntityId: "B", amount: 500_000 }],
      [{ fromEntityId: "B", toEntityId: "A", amount: 500_000 }],
    );
    expect(l).toHaveLength(0);
  });

  it("nets opposing transfers between the same pair into one direction", () => {
    // A→B worth 1M, B→A worth 300k → net B owes A 700k.
    const l = nettedLedger(
      [
        { fromEntityId: "A", toEntityId: "B", amount: 1_000_000 },
        { fromEntityId: "B", toEntityId: "A", amount: 300_000 },
      ],
      [],
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ creditorId: "A", debtorId: "B" });
    expect(l[0].amount.toNumber()).toBe(700_000);
  });

  it("over-payment flips the creditor", () => {
    const l = nettedLedger(
      [{ fromEntityId: "A", toEntityId: "B", amount: 100_000 }],
      [{ fromEntityId: "B", toEntityId: "A", amount: 150_000 }], // B overpays
    );
    expect(l[0]).toMatchObject({ creditorId: "B", debtorId: "A" });
    expect(l[0].amount.toNumber()).toBe(50_000);
  });

  it("keeps distinct pairs separate and sorts by amount desc", () => {
    const l = nettedLedger(
      [
        { fromEntityId: "A", toEntityId: "B", amount: 200_000 },
        { fromEntityId: "A", toEntityId: "C", amount: 900_000 },
      ],
      [],
    );
    expect(l).toHaveLength(2);
    expect(l[0].debtorId).toBe("C"); // largest first
    expect(l[1].debtorId).toBe("B");
  });

  it("ignores self-referential entries and empty input", () => {
    expect(nettedLedger([{ fromEntityId: "A", toEntityId: "A", amount: 100 }], [])).toEqual([]);
    expect(nettedLedger([], [])).toEqual([]);
  });
});
