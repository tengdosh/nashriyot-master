import { describe, it, expect } from "vitest";
import { computeScenario, type ScenarioInputs } from "@/lib/scenario";

const GOLDEN: ScenarioInputs = {
  fixedCosts: [12_000_000],
  pagesCount: 384,
  perPageCost: 95,
  fixedPrintCost: 3000,
  printRun: 3000,
  sellThroughRate: 0.8,
  discountRate: 0.45,
  royaltyRate: 0.1,
  targetMargin: 0.2,
};

describe("computeScenario", () => {
  it("golden inputs reproduce the finance.ts numbers", () => {
    const r = computeScenario(GOLDEN);
    expect(r.pc).toBe(39480);
    expect(r.uc).toBe(54350);
    expect(r.pmin).toBeCloseTo(120777.78, 2);
    expect(r.rrp).toBe(217400);
  });

  it("2nd-edition mode (unique = 0) → UC & RRP materially lower", () => {
    const normal = computeScenario(GOLDEN);
    const reprint = computeScenario({ ...GOLDEN, secondEditionMode: true });
    expect(reprint.uc).toBe(49350); // 118 440 000 / 2400
    expect(reprint.rrp).toBe(197400);
    expect(reprint.rrp).toBeLessThan(normal.rrp);
    expect(reprint.uc).toBeLessThan(normal.uc);
  });
});
