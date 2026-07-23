import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { computeScenario, type ScenarioInputs } from "@/lib/scenario";
import type { ScenarioSaveInput } from "@/lib/validators/acquisition";

export class GuardMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardMismatchError";
  }
}

function toInputs(s: ScenarioSaveInput): ScenarioInputs {
  return {
    fixedCosts: s.fixedCosts.map((c) => c.amount),
    pagesCount: s.pagesCount,
    perPageCost: s.perPageCost,
    fixedPrintCost: s.fixedPrintCost,
    printRun: s.printRun,
    sellThroughRate: s.sellThroughRate,
    discountRate: s.discountRate,
    royaltyRate: s.royaltyRate,
    targetMargin: s.targetMargin,
  };
}

/** Guard (spec item 6): recompute server-side and compare with the client's
 *  numbers. Both use lib/finance.ts, so they must agree (< 0.5 soʻm tolerance). */
export function verifyGuard(input: ScenarioSaveInput) {
  const server = computeScenario(toInputs(input));
  const c = input.clientResults;
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.5;
  if (!eq(server.uc, c.uc) || !eq(server.pmin, c.pmin) || !eq(server.rrp, c.rrp)) {
    throw new GuardMismatchError(
      `Server qayta hisobi klient qiymati bilan mos emas (UC ${server.uc}/${c.uc}, RRP ${server.rrp}/${c.rrp})`,
    );
  }
  return server;
}

export async function saveScenario(input: ScenarioSaveInput, userId: string) {
  const results = verifyGuard(input);
  return runWithAudit({ userId }, async () => {
    const data = {
      titleId: input.titleId ?? null,
      editionId: input.editionId ?? null,
      name: input.name,
      fixedCosts: input.fixedCosts as unknown as Prisma.InputJsonValue,
      pagesCount: input.pagesCount,
      perPageCost: new Prisma.Decimal(input.perPageCost),
      fixedPrintCost: new Prisma.Decimal(input.fixedPrintCost),
      printRun: input.printRun,
      sellThroughRate: new Prisma.Decimal(input.sellThroughRate),
      discountRate: new Prisma.Decimal(input.discountRate),
      royaltyRate: new Prisma.Decimal(input.royaltyRate),
      targetMargin: new Prisma.Decimal(input.targetMargin),
      results: results as unknown as Prisma.InputJsonValue,
    };
    if (input.id) {
      return await prisma.plScenario.update({ where: { id: input.id }, data });
    }
    return await prisma.plScenario.create({ data });
  });
}

/** APPROVED → ensure an edition plan exists + write draft TITLE cost_entries. */
export async function approveScenario(scenarioId: string, userId: string) {
  return runWithAudit({ userId }, async () => {
    const s = await prisma.plScenario.findUniqueOrThrow({ where: { id: scenarioId } });
    if (!s.titleId) throw new Error("Ssenariy asarga bogʻlanmagan");

    let editionId = s.editionId;
    if (!editionId) {
      const count = await prisma.edition.count({ where: { titleId: s.titleId } });
      const ed = await prisma.edition.create({
        data: { titleId: s.titleId, editionNo: count + 1, plannedRun: s.printRun, status: "PLANNED" },
      });
      editionId = ed.id;
      await prisma.plScenario.update({ where: { id: s.id }, data: { editionId } });
    }

    const fixedCosts = (s.fixedCosts as { label: string; amount: number }[]) ?? [];
    for (const fc of fixedCosts) {
      await prisma.costEntry.create({
        data: {
          scope: "TITLE",
          category: "BOSHQA",
          titleId: s.titleId,
          amount: new Prisma.Decimal(fc.amount),
          currency: "UZS",
          rate: new Prisma.Decimal(1),
          amountUZS: new Prisma.Decimal(fc.amount),
          date: new Date(),
          campaign: fc.label,
        },
      });
    }
    return { editionId, costDrafts: fixedCosts.length };
  });
}
