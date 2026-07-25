import { describe, it, expect } from "vitest";
import {
  validateTiers,
  assertValidTiers,
  describeTierProblem,
  tierOverlap,
  earnedByTier,
  buildStatement,
  parsePeriod,
  isPeriodClosed,
  assertPeriodClosed,
  explainTierLine,
  RoyaltyError,
  type TierInput,
} from "@/lib/royalty";

/** The reference ladder used across this file: 8% → 10% → 12%, LIST basis. */
const LADDER: TierInput[] = [
  { id: "t1", fromUnits: 0, toUnits: 2999, rate: 0.08, basis: "LIST" },
  { id: "t2", fromUnits: 3000, toUnits: 7999, rate: 0.1, basis: "LIST" },
  { id: "t3", fromUnits: 8000, toUnits: null, rate: 0.12, basis: "LIST" },
];
const LIST = 100_000;
const NET = 55_000;

describe("tier table validation (§5.6)", () => {
  it("a contiguous ascending ladder with one open end is valid", () => {
    expect(validateTiers(LADDER)).toEqual([]);
    expect(() => assertValidTiers(LADDER)).not.toThrow();
  });

  it("an empty ladder is rejected", () => {
    expect(validateTiers([])).toEqual([{ kind: "EMPTY" }]);
    expect(() => assertValidTiers([])).toThrow(RoyaltyError);
  });

  it("catches overlap, gap, inversion, negatives and a non-final open tier", () => {
    const overlap = validateTiers([
      { fromUnits: 0, toUnits: 3000, rate: 0.08 },
      { fromUnits: 2500, toUnits: 5000, rate: 0.1 },
    ]);
    expect(overlap).toEqual([{ kind: "OVERLAP", index: 1, previousIndex: 0 }]);

    const gap = validateTiers([
      { fromUnits: 0, toUnits: 2999, rate: 0.08 },
      { fromUnits: 4000, toUnits: null, rate: 0.1 },
    ]);
    expect(gap).toEqual([
      { kind: "GAP", index: 1, previousIndex: 0, missingFrom: 3000, missingTo: 3999 },
    ]);

    expect(validateTiers([{ fromUnits: 500, toUnits: 100, rate: 0.08 }])).toEqual([
      { kind: "INVERTED", index: 0 },
    ]);
    expect(validateTiers([{ fromUnits: -1, toUnits: 100, rate: 0.08 }])).toEqual([
      { kind: "NEGATIVE", index: 0 },
    ]);
    expect(validateTiers([{ fromUnits: 0, toUnits: -5, rate: 0.08 }])).toEqual([
      { kind: "NEGATIVE", index: 0 },
    ]);

    const openNotLast = validateTiers([
      { fromUnits: 0, toUnits: null, rate: 0.08 },
      { fromUnits: 3000, toUnits: 5000, rate: 0.1 },
    ]);
    expect(openNotLast).toEqual([{ kind: "OPEN_NOT_LAST", index: 0 }]);
  });

  it("tiers are validated per format — two independent ladders do not collide", () => {
    const perFormat: TierInput[] = [
      { format: "HARDCOVER", fromUnits: 0, toUnits: 999, rate: 0.1 },
      { format: "HARDCOVER", fromUnits: 1000, toUnits: null, rate: 0.12 },
      { format: "PAPERBACK", fromUnits: 0, toUnits: 4999, rate: 0.07 },
      { format: "PAPERBACK", fromUnits: 5000, toUnits: null, rate: 0.09 },
    ];
    expect(validateTiers(perFormat)).toEqual([]);

    // …but a hole inside one format is still caught.
    const broken: TierInput[] = [
      { format: "EBOOK", fromUnits: 0, toUnits: 99, rate: 0.2 },
      { format: "EBOOK", fromUnits: 500, toUnits: null, rate: 0.25 },
    ];
    expect(validateTiers(broken)[0].kind).toBe("GAP");
  });

  it("every problem kind has a readable Uzbek message", () => {
    const kinds = [
      describeTierProblem({ kind: "EMPTY" }),
      describeTierProblem({ kind: "NEGATIVE", index: 0 }),
      describeTierProblem({ kind: "INVERTED", index: 1 }),
      describeTierProblem({ kind: "OVERLAP", index: 2, previousIndex: 1 }),
      describeTierProblem({ kind: "GAP", index: 2, previousIndex: 1, missingFrom: 10, missingTo: 20 }),
      describeTierProblem({ kind: "OPEN_NOT_LAST", index: 0 }),
    ];
    expect(kinds.every((k) => k.length > 0)).toBe(true);
    expect(kinds[4]).toContain("10–20");
  });
});

describe("cumulative tier overlap", () => {
  it("counts units of [from, to) inside an inclusive tier range", () => {
    const t = { fromUnits: 3000, toUnits: 7999, rate: 0.1 };
    expect(tierOverlap(0, 3800, t)).toBe(800); // 3000…3799
    expect(tierOverlap(3800, 8300, t)).toBe(4200); // 3800…7999
    expect(tierOverlap(0, 3000, t)).toBe(0); // stops right before the tier
    expect(tierOverlap(9000, 9500, t)).toBe(0); // entirely past it
  });

  it("an open-ended tier absorbs everything above its floor", () => {
    const open = { fromUnits: 8000, toUnits: null, rate: 0.12 };
    expect(tierOverlap(0, 8000, open)).toBe(0);
    expect(tierOverlap(8000, 8300, open)).toBe(300);
    expect(tierOverlap(0, 1_000_000, open)).toBe(992_000);
  });

  it("an empty or inverted window yields nothing", () => {
    expect(tierOverlap(500, 500, LADDER[0])).toBe(0);
    expect(tierOverlap(500, 100, LADDER[0])).toBe(0);
  });
});

describe("earned by tier (§6.5)", () => {
  it("🏆 GOLDEN period 1: 4 000 sotildi − 200 qaytdi = 3 800 net → 32 000 000", () => {
    const r = earnedByTier({
      cumulativeBefore: 0,
      netUnits: 3800,
      tiers: LADDER,
      listUnit: LIST,
      netUnit: NET,
    });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ tierId: "t1", units: 3000 });
    expect(r.lines[0].amount.toNumber()).toBe(24_000_000); // 3000 × 100 000 × 8%
    expect(r.lines[1]).toMatchObject({ tierId: "t2", units: 800 });
    expect(r.lines[1].amount.toNumber()).toBe(8_000_000); // 800 × 100 000 × 10%
    expect(r.earned.toNumber()).toBe(32_000_000);
    expect(r.uncoveredUnits).toBe(0);
  });

  it("🏆 GOLDEN period 2 CONTINUES the ladder at 3 800 → 45 600 000, not 39 000 000", () => {
    const r = earnedByTier({
      cumulativeBefore: 3800,
      netUnits: 4500,
      tiers: LADDER,
      listUnit: LIST,
      netUnit: NET,
    });
    expect(r.lines.map((l) => [l.tierId, l.units])).toEqual([
      ["t2", 4200], // 3800…7999
      ["t3", 300], // 8000…8299
    ]);
    expect(r.earned.toNumber()).toBe(45_600_000); // 42 000 000 + 3 600 000

    // If tiers were (wrongly) restarted each period the answer would be lower —
    // this is the whole point of the cumulative axis.
    const perPeriodBug = earnedByTier({
      cumulativeBefore: 0,
      netUnits: 4500,
      tiers: LADDER,
      listUnit: LIST,
      netUnit: NET,
    });
    expect(perPeriodBug.earned.toNumber()).toBe(39_000_000);
    expect(r.earned.gt(perPeriodBug.earned)).toBe(true);
  });

  it("NET basis uses the SEALED net unit, LIST uses the cover price", () => {
    const mixed: TierInput[] = [
      { id: "n1", fromUnits: 0, toUnits: 999, rate: 0.1, basis: "NET" },
      { id: "n2", fromUnits: 1000, toUnits: null, rate: 0.1 }, // basis omitted → LIST
    ];
    const r = earnedByTier({ cumulativeBefore: 0, netUnits: 1500, tiers: mixed, listUnit: LIST, netUnit: NET });
    expect(r.lines[0].basis).toBe("NET");
    expect(r.lines[0].baseUnit.toNumber()).toBe(NET);
    expect(r.lines[0].amount.toNumber()).toBe(5_500_000); // 1000 × 55 000 × 10%
    expect(r.lines[1].basis).toBe("LIST");
    expect(r.lines[1].amount.toNumber()).toBe(5_000_000); // 500 × 100 000 × 10%
  });

  it("only tiers for this format (or format-agnostic ones) participate", () => {
    const tiers: TierInput[] = [
      { fromUnits: 0, toUnits: null, rate: 0.2, format: "HARDCOVER" },
      { fromUnits: 0, toUnits: null, rate: 0.05, format: "PAPERBACK" },
    ];
    const hc = earnedByTier({ cumulativeBefore: 0, netUnits: 100, tiers, format: "HARDCOVER", listUnit: LIST, netUnit: NET });
    expect(hc.earned.toNumber()).toBe(2_000_000);
    expect(hc.lines[0].tierId).toBeNull(); // no id supplied
    expect(hc.lines[0].toUnits).toBeNull();

    const audio = earnedByTier({ cumulativeBefore: 0, netUnits: 100, tiers, format: "AUDIO", listUnit: LIST, netUnit: NET });
    expect(audio.earned.toNumber()).toBe(0);
    expect(audio.uncoveredUnits).toBe(100); // the ladder covers nothing for AUDIO
  });

  it("zero net units earns nothing and reports no lines", () => {
    const r = earnedByTier({ cumulativeBefore: 500, netUnits: 0, tiers: LADDER, listUnit: LIST, netUnit: NET });
    expect(r.earned.toNumber()).toBe(0);
    expect(r.lines).toHaveLength(0);
    expect(r.uncoveredUnits).toBe(0);
  });

  it("rejects negative inputs", () => {
    expect(() => earnedByTier({ cumulativeBefore: 0, netUnits: -1, tiers: LADDER, listUnit: LIST, netUnit: NET })).toThrow(RoyaltyError);
    expect(() => earnedByTier({ cumulativeBefore: -1, netUnits: 10, tiers: LADDER, listUnit: LIST, netUnit: NET })).toThrow(RoyaltyError);
  });
});

describe("statement: reserve, release and advance recoup (§6.5)", () => {
  const base = { tiers: LADDER, listUnit: LIST, netUnit: NET, reserveRate: 0.15 };

  it("🏆 GOLDEN period 1: zaxira 15%, avans 5 mln → to'lov 22 200 000", () => {
    const s = buildStatement({
      ...base,
      cumulativeBefore: 0,
      unitsSold: 4000,
      returnedUnits: 200,
      advanceOutstanding: 5_000_000,
    });
    expect(s.netUnits).toBe(3800);
    expect(s.earned.toNumber()).toBe(32_000_000);
    expect(s.reserveHeld.toNumber()).toBe(4_800_000); // 15%
    expect(s.reserveReleased.toNumber()).toBe(0); // nothing held before
    expect(s.payableBefore.toNumber()).toBe(27_200_000);
    expect(s.advanceRecouped.toNumber()).toBe(5_000_000); // advance fully recouped
    expect(s.advanceOutstandingAfter.toNumber()).toBe(0);
    expect(s.payable.toNumber()).toBe(22_200_000);
  });

  it("🏆 GOLDEN period 2: oldingi zaxira ochiladi, avans tugagan → 42 560 000", () => {
    const s = buildStatement({
      ...base,
      cumulativeBefore: 3800,
      unitsSold: 5000,
      returnedUnits: 500,
      previousReserveHeld: 4_800_000,
      actualReturnImpact: 1_000_000,
      advanceOutstanding: 0,
    });
    expect(s.netUnits).toBe(4500);
    expect(s.earned.toNumber()).toBe(45_600_000);
    expect(s.reserveHeld.toNumber()).toBe(6_840_000);
    expect(s.reserveReleased.toNumber()).toBe(3_800_000); // 4 800 000 − 1 000 000
    expect(s.payableBefore.toNumber()).toBe(42_560_000);
    expect(s.advanceRecouped.toNumber()).toBe(0);
    expect(s.payable.toNumber()).toBe(42_560_000);
  });

  it("returns costing more than the reserve are absorbed, never clawed back", () => {
    const s = buildStatement({
      ...base,
      cumulativeBefore: 0,
      unitsSold: 100,
      returnedUnits: 0,
      previousReserveHeld: 1_000_000,
      actualReturnImpact: 9_000_000, // far worse than we held
    });
    expect(s.reserveReleased.toNumber()).toBe(0); // floored, not negative
    // earned 100 × 100 000 × 8% = 800 000 ; reserve 120 000
    expect(s.payableBefore.toNumber()).toBe(680_000);
    expect(s.payable.toNumber()).toBe(680_000);
  });

  it("recoup stops at the outstanding advance and never bills the author", () => {
    // Small period against a big advance: everything goes to recoup, payable 0.
    const s = buildStatement({
      ...base,
      cumulativeBefore: 0,
      unitsSold: 100,
      returnedUnits: 0,
      advanceOutstanding: 50_000_000,
    });
    expect(s.earned.toNumber()).toBe(800_000);
    expect(s.payableBefore.toNumber()).toBe(680_000);
    expect(s.advanceRecouped.toNumber()).toBe(680_000); // capped by payableBefore
    expect(s.advanceOutstandingAfter.toNumber()).toBe(49_320_000);
    expect(s.payable.toNumber()).toBe(0);
  });

  it("a period with no sales pays nothing and recoups nothing", () => {
    const s = buildStatement({
      ...base,
      cumulativeBefore: 3800,
      unitsSold: 0,
      returnedUnits: 0,
      advanceOutstanding: 1_000_000,
    });
    expect(s.netUnits).toBe(0);
    expect(s.earned.toNumber()).toBe(0);
    expect(s.payableBefore.toNumber()).toBe(0);
    expect(s.advanceRecouped.toNumber()).toBe(0);
    expect(s.payable.toNumber()).toBe(0);
    expect(s.advanceOutstandingAfter.toNumber()).toBe(1_000_000);
  });

  it("defaults: no previous reserve, no return impact, no advance", () => {
    const s = buildStatement({ ...base, cumulativeBefore: 0, unitsSold: 1000, returnedUnits: 0 });
    expect(s.reserveReleased.toNumber()).toBe(0);
    expect(s.advanceRecouped.toNumber()).toBe(0);
    expect(s.payable.toNumber()).toBe(6_800_000); // 8 000 000 − 15%
  });

  it("rejects an impossible reserve rate or more returns than sales", () => {
    expect(() => buildStatement({ ...base, reserveRate: -0.1, cumulativeBefore: 0, unitsSold: 1, returnedUnits: 0 })).toThrow(RoyaltyError);
    expect(() => buildStatement({ ...base, reserveRate: 1, cumulativeBefore: 0, unitsSold: 1, returnedUnits: 0 })).toThrow(RoyaltyError);
    expect(() => buildStatement({ ...base, cumulativeBefore: 0, unitsSold: 10, returnedUnits: 11 })).toThrow(RoyaltyError);
  });
});

describe("period windows (determinism guard)", () => {
  it("parses half-year, quarter and month codes into UTC windows", () => {
    const h1 = parsePeriod("2026-H1");
    expect(h1.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(h1.end.toISOString()).toBe("2026-06-30T23:59:59.999Z");

    const h2 = parsePeriod("2026-H2");
    expect(h2.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(h2.end.toISOString()).toBe("2026-12-31T23:59:59.999Z");

    const q3 = parsePeriod("2026-Q3");
    expect(q3.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(q3.end.toISOString()).toBe("2026-09-30T23:59:59.999Z");

    const m2 = parsePeriod("2026-M02");
    expect(m2.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(m2.end.toISOString()).toBe("2026-02-28T23:59:59.999Z");

    // Consecutive windows must not leave a gap or overlap by even a millisecond.
    expect(h2.start.getTime() - h1.end.getTime()).toBe(1);
  });

  it("rejects a malformed period code", () => {
    for (const bad of ["2026", "26-H1", "2026-H3", "2026-Q5", "2026-M13", "2026-M0", "hello"]) {
      expect(() => parsePeriod(bad)).toThrow(RoyaltyError);
    }
  });

  it("a period may only be run once it is over", () => {
    const h1 = parsePeriod("2026-H1");
    const afterH1 = new Date("2026-07-25T00:00:00Z");
    const duringH1 = new Date("2026-03-15T00:00:00Z");

    expect(isPeriodClosed(h1, afterH1)).toBe(true);
    expect(isPeriodClosed(h1, duringH1)).toBe(false);
    expect(() => assertPeriodClosed(h1, afterH1)).not.toThrow();
    expect(() => assertPeriodClosed(h1, duringH1)).toThrow(RoyaltyError);
  });
});

describe("statement explanation lines", () => {
  it("says which tier, how many copies and on which basis", () => {
    const r = earnedByTier({ cumulativeBefore: 0, netUnits: 3800, tiers: LADDER, listUnit: LIST, netUnit: NET });
    const first = explainTierLine(r.lines[0]);
    expect(first).toContain("1–3000 nusxa");
    expect(first).toContain("3000 dona");
    expect(first).toContain("asosiy narx");
    expect(first).toContain("8.0%");
    expect(first).toContain("24000000");

    const open = earnedByTier({ cumulativeBefore: 8000, netUnits: 10, tiers: LADDER, listUnit: LIST, netUnit: NET });
    expect(explainTierLine(open.lines[0])).toContain("8001+");

    const netLine = earnedByTier({
      cumulativeBefore: 0,
      netUnits: 10,
      tiers: [{ fromUnits: 0, toUnits: null, rate: 0.1, basis: "NET" }],
      listUnit: LIST,
      netUnit: NET,
    });
    expect(explainTierLine(netLine.lines[0])).toContain("sof narx");
  });
});
