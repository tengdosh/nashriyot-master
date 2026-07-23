import {
  printCost,
  totalCost,
  unitCost,
  minViablePrice,
  rrp as rrpFn,
  breakEvenUnits,
} from "@/lib/finance";

/**
 * Scenario compute — the SAME pure function runs client-side (live <100ms results)
 * and server-side (the save guard recomputes and compares). Client-safe: only
 * lib/finance.ts. "2nd edition mode" zeroes the unique/title fixed costs (only
 * print costs remain), so the reprint's RRP is materially lower.
 */
export type ScenarioInputs = {
  fixedCosts: number[];
  pagesCount: number;
  perPageCost: number;
  fixedPrintCost: number;
  printRun: number;
  sellThroughRate: number;
  discountRate: number;
  royaltyRate: number;
  targetMargin: number;
  secondEditionMode?: boolean;
};

export type ScenarioResults = {
  pc: number;
  tc: number;
  uc: number;
  pmin: number;
  rrp: number;
  breakEven: number;
};

export function computeScenario(i: ScenarioInputs): ScenarioResults {
  const fixed = i.secondEditionMode ? [] : i.fixedCosts;
  const pc = printCost({ fixedPrintCost: i.fixedPrintCost, pages: i.pagesCount, perPageCost: i.perPageCost });
  const tc = totalCost({ fixedCosts: fixed, printRun: i.printRun, pc });
  const uc = unitCost({ tc, printRun: i.printRun, sellThroughRate: i.sellThroughRate });
  const pmin = minViablePrice({ uc, discountRate: i.discountRate, royaltyRate: i.royaltyRate });
  const retail = rrpFn({ uc, discountRate: i.discountRate, royaltyRate: i.royaltyRate, targetMargin: i.targetMargin });
  const be = breakEvenUnits({
    fixedCosts: fixed,
    price: retail,
    discountRate: i.discountRate,
    royaltyRate: i.royaltyRate,
    pc,
  });
  return {
    pc: pc.toNumber(),
    tc: tc.toNumber(),
    uc: uc.toNumber(),
    pmin: pmin.toNumber(),
    rrp: retail.toNumber(),
    breakEven: be.toNumber(),
  };
}
