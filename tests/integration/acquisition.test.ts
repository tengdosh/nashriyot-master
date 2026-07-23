import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createTitle } from "@/lib/services/title-service";
import { createCostEntry } from "@/lib/services/cost-service";
import { saveScenario, approveScenario, GuardMismatchError } from "@/lib/services/scenario-service";
import { computeScenario } from "@/lib/scenario";

const USER = "user-editor";
const titleIds: string[] = [];

async function mkTitle(name: string) {
  const t = await createTitle(
    {
      workTitle: name,
      ownerType: "OWN",
      entityId: "ent-tasnim",
      ownerPartnerId: null,
      language: "uz",
      seriesId: null,
      description: null,
      keywords: [],
      themaCodes: [],
      bisacCodes: [],
    },
    USER,
  );
  titleIds.push(t.id);
  return t;
}

const INPUTS = {
  name: "M3 test ssenariy",
  fixedCosts: [{ label: "huquq", amount: 12_000_000 }],
  pagesCount: 384,
  perPageCost: 95,
  fixedPrintCost: 3000,
  printRun: 3000,
  sellThroughRate: 0.8,
  discountRate: 0.45,
  royaltyRate: 0.1,
  targetMargin: 0.2,
};

describe("M3 — acquisition (cost + scenario)", () => {
  afterAll(async () => {
    for (const id of titleIds) {
      await prisma.auditLog.deleteMany({ where: { entity: "Title", entityId: id } });
      await prisma.plScenario.deleteMany({ where: { titleId: id } });
      await prisma.costEntry.deleteMany({ where: { titleId: id } });
      await prisma.edition.deleteMany({ where: { titleId: id } });
      await prisma.title.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("createCostEntry: USD amount converts to amountUZS via rate", async () => {
    const c = await createCostEntry(
      { scope: "FIXED", category: "IJARA", entityId: "ent-tasnim", amount: 1000, currency: "USD", rate: 12600, date: new Date().toISOString() },
      USER,
    );
    expect(Number(c.amountUZS)).toBe(12_600_000);
    await prisma.costEntry.delete({ where: { id: c.id } });
  });

  it("saveScenario: guard passes when client matches, throws on mismatch", async () => {
    const t = await mkTitle("M3 guard");
    const results = computeScenario({ ...INPUTS, fixedCosts: INPUTS.fixedCosts.map((f) => f.amount) });
    const saved = await saveScenario(
      { ...INPUTS, titleId: t.id, clientResults: { uc: results.uc, pmin: results.pmin, rrp: results.rrp } },
      USER,
    );
    expect(saved.id).toBeTruthy();

    await expect(
      saveScenario({ ...INPUTS, titleId: t.id, clientResults: { uc: 1, pmin: 1, rrp: 1 } }, USER),
    ).rejects.toBeInstanceOf(GuardMismatchError);
  });

  it("approveScenario: creates edition plan + draft TITLE cost entries", async () => {
    const t = await mkTitle("M3 approve");
    const results = computeScenario({ ...INPUTS, fixedCosts: INPUTS.fixedCosts.map((f) => f.amount) });
    const s = await saveScenario(
      { ...INPUTS, titleId: t.id, clientResults: { uc: results.uc, pmin: results.pmin, rrp: results.rrp } },
      USER,
    );
    const r = await approveScenario(s.id, USER);
    expect(r.editionId).toBeTruthy();
    expect(r.costDrafts).toBe(1);
    expect(await prisma.edition.count({ where: { titleId: t.id } })).toBe(1);
    expect(await prisma.costEntry.count({ where: { titleId: t.id, scope: "TITLE" } })).toBe(1);
  });
});
