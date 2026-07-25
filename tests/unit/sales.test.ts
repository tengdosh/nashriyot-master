import { describe, it, expect } from "vitest";
import {
  suggestDiscount,
  lineEconomics,
  orderTotals,
  checkPMin,
  checkCreditLimit,
  agingBucket,
  daysOverdue,
  agingSummary,
  channelKpi,
  netSales,
  SalesError,
  DISCOUNT_PRECEDENCE,
  AGING_BUCKETS,
  AGING_LABELS,
  type DiscountRuleInput,
} from "@/lib/sales";

const NOW = new Date("2026-07-25T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("discount rule engine (v2 §7.3)", () => {
  const rules: DiscountRuleInput[] = [
    { id: "r-partner", scope: "PARTNER", refId: "p-akmal", rate: 0.35 },
    { id: "r-volume", scope: "VOLUME", minQty: 100, rate: 0.3 },
    { id: "r-title", scope: "TITLE", refId: "t-1", rate: 0.25 },
    { id: "r-entity", scope: "ENTITY", refId: "ent-sotuv", rate: 0.2 },
    { id: "r-default", scope: "DEFAULT", rate: 0.1 },
  ];

  it("precedence is PARTNER → VOLUME → TITLE → ENTITY → DEFAULT", () => {
    expect(DISCOUNT_PRECEDENCE).toEqual(["PARTNER", "VOLUME", "TITLE", "ENTITY", "DEFAULT"]);

    const partner = suggestDiscount(rules, {
      partnerId: "p-akmal",
      titleId: "t-1",
      entityId: "ent-sotuv",
      qty: 500,
    });
    expect(partner.rate.toNumber()).toBe(0.35);
    expect(partner.source).toBe("PARTNER");
    expect(partner.ruleId).toBe("r-partner");

    // No partner match → volume wins because qty ≥ minQty.
    expect(suggestDiscount(rules, { titleId: "t-1", entityId: "ent-sotuv", qty: 500 })).toMatchObject({
      source: "VOLUME",
    });
    // Below the volume threshold → title.
    expect(suggestDiscount(rules, { titleId: "t-1", entityId: "ent-sotuv", qty: 5 })).toMatchObject({
      source: "TITLE",
    });
    // Unknown title → entity.
    expect(suggestDiscount(rules, { titleId: "t-other", entityId: "ent-sotuv", qty: 5 })).toMatchObject({
      source: "ENTITY",
    });
    // Nothing specific → default.
    expect(suggestDiscount(rules, { qty: 1 })).toMatchObject({ source: "DEFAULT", ruleId: "r-default" });
  });

  it("a partner rule for someone else does not apply", () => {
    const s = suggestDiscount(rules, { partnerId: "p-boshqa", qty: 1 });
    expect(s.source).toBe("DEFAULT");
  });

  it("inactive rules are ignored; a VOLUME rule without minQty never matches", () => {
    const s = suggestDiscount(
      [
        { id: "off", scope: "PARTNER", refId: "p-akmal", rate: 0.9, isActive: false },
        { id: "novol", scope: "VOLUME", minQty: null, rate: 0.8 },
        { id: "keep", scope: "DEFAULT", rate: 0.1, isActive: true },
      ],
      { partnerId: "p-akmal", qty: 9999 },
    );
    expect(s.source).toBe("DEFAULT");
    expect(s.rate.toNumber()).toBe(0.1);
  });

  it("inside a scope: highest priority wins, then the higher rate", () => {
    const byPriority = suggestDiscount(
      [
        { id: "lo", scope: "PARTNER", refId: "p", rate: 0.5, priority: 1 },
        { id: "hi", scope: "PARTNER", refId: "p", rate: 0.2, priority: 9 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(byPriority.ruleId).toBe("hi"); // priority beats a bigger rate

    const reversed = suggestDiscount(
      [
        { id: "hi", scope: "PARTNER", refId: "p", rate: 0.2, priority: 9 },
        { id: "lo", scope: "PARTNER", refId: "p", rate: 0.5, priority: 1 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(reversed.ruleId).toBe("hi"); // order-independent

    const tie = suggestDiscount(
      [
        { id: "small", scope: "PARTNER", refId: "p", rate: 0.2, priority: 5 },
        { id: "big", scope: "PARTNER", refId: "p", rate: 0.4, priority: 5 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(tie.ruleId).toBe("big"); // equal priority → better rate for the customer

    const tieReversed = suggestDiscount(
      [
        { id: "big", scope: "PARTNER", refId: "p", rate: 0.4, priority: 5 },
        { id: "small", scope: "PARTNER", refId: "p", rate: 0.2, priority: 5 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(tieReversed.ruleId).toBe("big");
  });

  it("rules with no priority are treated as priority 0; an id-less rule reports a null ruleId", () => {
    const s = suggestDiscount(
      [
        { scope: "PARTNER", refId: "p", rate: 0.15 },
        { scope: "PARTNER", refId: "p", rate: 0.3 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(s.rate.toNumber()).toBe(0.3); // equal (absent) priority → better rate
    expect(s.ruleId).toBeNull();

    // A defined priority still beats an absent one in both argument orders.
    const mixed = suggestDiscount(
      [
        { id: "noprio", scope: "PARTNER", refId: "p", rate: 0.9 },
        { id: "prio", scope: "PARTNER", refId: "p", rate: 0.1, priority: 3 },
      ],
      { partnerId: "p", qty: 1 },
    );
    expect(mixed.ruleId).toBe("prio");
  });

  it("no rules at all → zero discount from source NONE", () => {
    const s = suggestDiscount([], { qty: 1 });
    expect(s.rate.toNumber()).toBe(0);
    expect(s.source).toBe("NONE");
    expect(s.ruleId).toBeNull();
  });
});

describe("line economics (v1 §6.4)", () => {
  it("🏆 GOLDEN: RRP 217 400 @ 45% chegirma, UC 54 350, royalti 10% → CM 43 480", () => {
    const e = lineEconomics({
      qty: 100,
      unitPrice: 217_400,
      discountRate: 0.45,
      cogsUnit: 54_350,
      royaltyEstUnit: 21_740, // 10% of list
    });
    expect(e.netUnit.toNumber()).toBe(119_570); // 217 400 × 0.55
    expect(e.cmUnit.toNumber()).toBe(43_480); // 119 570 − 54 350 − 21 740
    expect(e.grossTotal.toNumber()).toBe(21_740_000);
    expect(e.netTotal.toNumber()).toBe(11_957_000);
    expect(e.cmTotal.toNumber()).toBe(4_348_000);
    expect(e.channelFeeUnit.toNumber()).toBe(0);
  });

  it("marketplace fee is taken off the DISCOUNTED price and lowers CM", () => {
    const e = lineEconomics({
      qty: 10,
      unitPrice: 100_000,
      discountRate: 0.2,
      channelFeeRate: 0.15,
      cogsUnit: 40_000,
    });
    expect(e.channelFeeUnit.toNumber()).toBe(12_000); // 80 000 × 0.15
    expect(e.netUnit.toNumber()).toBe(68_000);
    expect(e.cmUnit.toNumber()).toBe(28_000);
  });

  it("delivery per unit reduces CM (retail, v2 §5.3)", () => {
    const e = lineEconomics({
      qty: 1,
      unitPrice: 100_000,
      discountRate: 0,
      cogsUnit: 40_000,
      deliveryCostUnit: 15_000,
    });
    expect(e.cmUnit.toNumber()).toBe(45_000);
  });

  it("before ship there is no COGS — CM is the pre-COGS contribution", () => {
    const e = lineEconomics({ qty: 5, unitPrice: 100_000, discountRate: 0.1, cogsUnit: null });
    expect(e.cogsUnit.toNumber()).toBe(0);
    expect(e.cmUnit.toNumber()).toBe(90_000);
  });

  it("rejects a non-positive qty and an out-of-range discount", () => {
    expect(() => lineEconomics({ qty: 0, unitPrice: 1, discountRate: 0 })).toThrow(SalesError);
    expect(() => lineEconomics({ qty: 1, unitPrice: 1, discountRate: -0.1 })).toThrow(SalesError);
    expect(() => lineEconomics({ qty: 1, unitPrice: 1, discountRate: 1 })).toThrow(SalesError);
  });

  it("order totals aggregate lines and derive the CM rate", () => {
    const t = orderTotals([
      { qty: 10, unitPrice: 100_000, discountRate: 0, cogsUnit: 40_000 },
      { qty: 5, unitPrice: 200_000, discountRate: 0.5, cogsUnit: 50_000 },
    ]);
    expect(t.units).toBe(15);
    expect(t.gross.toNumber()).toBe(2_000_000); // 1 000 000 + 1 000 000
    expect(t.net.toNumber()).toBe(1_500_000); // 1 000 000 + 500 000
    expect(t.cogs.toNumber()).toBe(650_000); // 400 000 + 250 000
    expect(t.cm.toNumber()).toBe(850_000);
    expect(t.cmRate.toNumber()).toBeCloseTo(0.5667, 4);
  });

  it("an empty order has a zero CM rate instead of dividing by zero", () => {
    const t = orderTotals([]);
    expect(t.net.toNumber()).toBe(0);
    expect(t.cmRate.toNumber()).toBe(0);
  });
});

describe("P_min floor (§3.3, everywhere a price/discount is set)", () => {
  it("🏆 GOLDEN: UC 54 350 @ 45%/10% → P_min 120 778; RRP 217 400 clears it", () => {
    const ok = checkPMin({ unitPrice: 217_400, discountRate: 0.45, unitCost: 54_350, royaltyRate: 0.1 });
    expect(ok.pMin.toNumber()).toBeCloseTo(120_777.78, 2);
    expect(ok.violated).toBe(false);
    expect(ok.shortfall.toNumber()).toBe(0);
    expect(ok.effectivePrice.toNumber()).toBe(119_570);
  });

  it("a 70% discount pushes P_min above the list price → violation with shortfall", () => {
    const bad = checkPMin({ unitPrice: 217_400, discountRate: 0.7, unitCost: 54_350, royaltyRate: 0.1 });
    expect(bad.pMin.toNumber()).toBeCloseTo(271_750, 2); // 54 350 / 0.20
    expect(bad.violated).toBe(true);
    expect(bad.shortfall.toNumber()).toBeCloseTo(54_350, 2);
  });

  it("discount + royalty ≥ 100% is reported as an infinite floor, not a crash", () => {
    const impossible = checkPMin({ unitPrice: 100_000, discountRate: 0.95, unitCost: 1, royaltyRate: 0.1 });
    expect(impossible.violated).toBe(true);
    expect(impossible.pMin.isFinite()).toBe(false);
    expect(impossible.shortfall.isFinite()).toBe(false);
  });

  it("royalty defaults to zero when the title has no ROYALTY contract", () => {
    const c = checkPMin({ unitPrice: 100_000, discountRate: 0.5, unitCost: 40_000 });
    expect(c.pMin.toNumber()).toBe(80_000); // 40 000 / 0.5
    expect(c.violated).toBe(false);
  });
});

describe("credit limit (checked at CONFIRMED)", () => {
  it("a partner with no limit is unlimited, not zero", () => {
    const c = checkCreditLimit({ creditLimit: null, outstandingUZS: 99_000_000, orderValueUZS: 5_000_000 });
    expect(c.limit).toBeNull();
    expect(c.headroom).toBeNull();
    expect(c.exceeded).toBe(false);
  });

  it("a blocked partner is refused even with no limit and even within headroom", () => {
    expect(
      checkCreditLimit({ creditLimit: null, outstandingUZS: 0, orderValueUZS: 1, isBlocked: true }).exceeded,
    ).toBe(true);
    expect(
      checkCreditLimit({
        creditLimit: 10_000_000,
        outstandingUZS: 0,
        orderValueUZS: 1,
        isBlocked: true,
      }).exceeded,
    ).toBe(true);
  });

  it("order value is compared against the remaining headroom", () => {
    const within = checkCreditLimit({
      creditLimit: 10_000_000,
      outstandingUZS: 4_000_000,
      orderValueUZS: 6_000_000,
    });
    expect(within.headroom!.toNumber()).toBe(6_000_000);
    expect(within.exceeded).toBe(false); // exactly at the limit is allowed

    const over = checkCreditLimit({
      creditLimit: 10_000_000,
      outstandingUZS: 4_000_000,
      orderValueUZS: 6_000_001,
    });
    expect(over.exceeded).toBe(true);
  });
});

describe("AR aging (v1 §5.5)", () => {
  it("buckets are 0–30 / 31–60 / 61–90 / 90+, and not-yet-due is CURRENT", () => {
    expect(agingBucket(0)).toBe("CURRENT");
    expect(agingBucket(-5)).toBe("CURRENT");
    expect(agingBucket(1)).toBe("D0_30");
    expect(agingBucket(30)).toBe("D0_30");
    expect(agingBucket(31)).toBe("D31_60");
    expect(agingBucket(60)).toBe("D31_60");
    expect(agingBucket(61)).toBe("D61_90");
    expect(agingBucket(90)).toBe("D61_90");
    expect(agingBucket(91)).toBe("D90_PLUS");
    expect(AGING_BUCKETS).toHaveLength(5);
    expect(AGING_LABELS.D90_PLUS).toBe("90+ kun");
  });

  it("a missing due date is never overdue", () => {
    expect(daysOverdue(null, NOW)).toBe(0);
    expect(daysOverdue(undefined, NOW)).toBe(0);
    expect(daysOverdue(daysAgo(45), NOW)).toBe(45);
  });

  it("summary splits the debt and reports the overdue part", () => {
    const s = agingSummary(
      [
        { outstandingUZS: 1_000_000, dueDate: new Date(NOW.getTime() + 10 * 86_400_000) }, // future
        { outstandingUZS: 2_000_000, dueDate: daysAgo(10) },
        { outstandingUZS: 3_000_000, dueDate: daysAgo(45) },
        { outstandingUZS: 4_000_000, dueDate: daysAgo(75) },
        { outstandingUZS: 5_000_000, dueDate: daysAgo(200) },
        { outstandingUZS: 0, dueDate: daysAgo(300) }, // settled → excluded
        { outstandingUZS: -100, dueDate: daysAgo(300) }, // overpaid → excluded
      ],
      NOW,
    );
    expect(s.buckets.CURRENT.toNumber()).toBe(1_000_000);
    expect(s.buckets.D0_30.toNumber()).toBe(2_000_000);
    expect(s.buckets.D31_60.toNumber()).toBe(3_000_000);
    expect(s.buckets.D61_90.toNumber()).toBe(4_000_000);
    expect(s.buckets.D90_PLUS.toNumber()).toBe(5_000_000);
    expect(s.total.toNumber()).toBe(15_000_000);
    expect(s.overdue.toNumber()).toBe(14_000_000);
  });
});

describe("channel KPI and period net sales", () => {
  it("a marketplace is judged on NET, other channels on GROSS", () => {
    const lines = [{ qty: 10, unitPrice: 100_000, discountRate: 0.2, channelFeeRate: 0.15, cogsUnit: 40_000 }];
    expect(channelKpi("MARKETPLACE", lines).headlineMetric).toBe("NET");
    expect(channelKpi("RETAIL", lines).headlineMetric).toBe("GROSS");
    const k = channelKpi("MARKETPLACE", lines);
    expect(k.gross.toNumber()).toBe(1_000_000);
    expect(k.net.toNumber()).toBe(680_000);
    expect(k.cm.toNumber()).toBe(280_000);
    expect(k.units).toBe(10);
    expect(k.cmRate.toNumber()).toBeCloseTo(0.4118, 4);
  });

  it("returns reduce period net sales at the SEALED net of their line", () => {
    const s = netSales([
      { qty: 100, returnedQty: 10, netUnit: 80_000 },
      { qty: 50, returnedQty: 0, netUnit: 120_000 },
    ]);
    expect(s.units).toBe(150);
    expect(s.returnedUnits).toBe(10);
    expect(s.netUnits).toBe(140);
    expect(s.revenue.toNumber()).toBe(13_200_000); // 90×80k + 50×120k
  });
});
