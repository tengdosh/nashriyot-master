import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import {
  computeDailyCost,
  getDecisionFloor,
  getReportCost,
  snapshotAllCosts,
} from "@/lib/services/costing-service";

const USER = "user-director";
const MAIN = "wh-tasnim-main";
const ENTITY = "ent-tasnim";

let titleId = "";
let productId = "";
const created = { titles: [] as string[], products: [] as string[], costs: [] as string[] };

async function fixedCost(amount: number, when: Date) {
  const c = await prisma.costEntry.create({
    data: {
      scope: "FIXED", category: "IJARA", entityId: ENTITY,
      amount: new Prisma.Decimal(amount), currency: "UZS", rate: new Prisma.Decimal(1),
      amountUZS: new Prisma.Decimal(amount), date: when,
    },
  });
  created.costs.push(c.id);
}

describe("M12 — jonli tan-narx dvigateli", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: { workTitle: "M12 test kitob", ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    titleId = t.id;
    created.titles.push(t.id);
    // Two editions → Σ plannedRuns = 5000 for the unique layer.
    await prisma.edition.create({ data: { titleId, editionNo: 1, plannedRun: 3000, status: "ACTIVE" } });
    const e2 = await prisma.edition.create({ data: { titleId, editionNo: 2, plannedRun: 2000, status: "ACTIVE" } });
    const p = await prisma.product.create({
      data: { titleId, editionId: e2.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(120_000), vatRate: new Prisma.Decimal(0) },
    });
    productId = p.id;
    created.products.push(p.id);

    // TITLE unique costs = 50 000 000 → uniquePerCopy = 50m / 5000 = 10 000.
    const c = await prisma.costEntry.create({
      data: {
        scope: "TITLE", category: "TARJIMA", titleId,
        amount: new Prisma.Decimal(50_000_000), currency: "UZS", rate: new Prisma.Decimal(1),
        amountUZS: new Prisma.Decimal(50_000_000), date: new Date("2026-01-01T00:00:00Z"),
      },
    });
    created.costs.push(c.id);

    // 1000 copies on hand at print unit 40 000.
    await stockInTx({ productId, warehouseId: MAIN, qty: 1000, unitCostUZS: 40_000 }, USER);
  });

  afterAll(async () => {
    await prisma.dailyUnitCost.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.notification.deleteMany({ where: { refType: "Product", refId: { in: created.products } } });
    await prisma.costEntry.deleteMany({ where: { id: { in: created.costs } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.inventoryItem.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.edition.deleteMany({ where: { titleId: { in: created.titles } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...created.titles, ...created.products] } } });
    await prisma.title.deleteMany({ where: { id: { in: created.titles } } });
    await prisma.$disconnect();
  });

  it("🏆 reportCost = unique + print + fixed; decisionCost = print only (no double-count)", async () => {
    // FIXED pool 3 000 000 this month, ~1000 copies entity-wide.
    const now = new Date("2026-06-15T00:00:00Z");
    await fixedCost(3_000_000, new Date("2026-06-10T00:00:00Z"));

    const duc = await computeDailyCost(productId, USER, now);

    // Print (FIFO) = 40 000. Unique = 10 000. Fixed for one day is tiny.
    expect(Number(duc.baseUnit)).toBe(40_000);
    // reportCost ≈ 50 000 + a small daily fixed slice; decisionCost ≈ 40 000 + holding.
    expect(Number(duc.reportCost)).toBeGreaterThanOrEqual(50_000);
    expect(Number(duc.reportCost)).toBeLessThan(50_200); // fixed/day is small
    // decisionCost must NOT include the 10 000 unique or accrued fixed.
    expect(Number(duc.decisionCost)).toBeGreaterThanOrEqual(40_000);
    expect(Number(duc.decisionCost)).toBeLessThan(40_100); // just print + daily holding
    expect(Number(duc.decisionCost)).toBeLessThan(Number(duc.reportCost));
  });

  it("fixed layer ACCUMULATES across snapshots (copy-day)", async () => {
    const d1 = await prisma.dailyUnitCost.findFirstOrThrow({ where: { productId }, orderBy: { date: "desc" } });
    const cum1 = Number(d1.allocFixedCum);

    // Next day's snapshot adds another day's fixed-per-copy on top.
    const day2 = await computeDailyCost(productId, USER, new Date("2026-06-16T00:00:00Z"));
    expect(Number(day2.allocFixedCum)).toBeGreaterThan(cum1);
    // reportCost grew by exactly the day's fixed increment.
    expect(Number(day2.reportCost)).toBeGreaterThan(Number(d1.reportCost));
  });

  it("getDecisionFloor / getReportCost return the latest snapshot", async () => {
    const floor = await getDecisionFloor(productId);
    const report = await getReportCost(productId);
    expect(floor).not.toBeNull();
    expect(report).not.toBeNull();
    expect(floor!.lt(report!)).toBe(true); // decision (sunk-free) < report (full)
    // A product with no snapshot → null.
    expect(await getDecisionFloor("no-such-product")).toBeNull();
  });

  it("snapshotAllCosts skips zero-stock SKUs and snapshots in-stock ones", async () => {
    const res = await snapshotAllCosts({ userId: USER, now: new Date("2026-06-17T00:00:00Z") });
    expect(res.snapshotted).toBeGreaterThanOrEqual(1);
    const today = await prisma.dailyUnitCost.findFirst({
      where: { productId, date: new Date("2026-06-17T00:00:00Z") },
    });
    expect(today).toBeTruthy();
  });

  it("break-even alert fires when reportCost trends to cross expNet within 30 days", async () => {
    // Dedicated SKU with NO title/fixed costs, so today's REAL computed snapshot
    // is reportCost ≈ print (100 000) and expNet ≈ list (102 000) — it continues
    // the seeded converging trend instead of being an outlier.
    const t = await prisma.title.create({
      data: { workTitle: "M12 kesishish", ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    created.titles.push(t.id);
    const e = await prisma.edition.create({ data: { titleId: t.id, editionNo: 1, plannedRun: 1000, status: "ACTIVE" } });
    const p = await prisma.product.create({
      data: { titleId: t.id, editionId: e.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(102_000), vatRate: new Prisma.Decimal(0) },
    });
    created.products.push(p.id);
    await stockInTx({ productId: p.id, warehouseId: MAIN, qty: 100, unitCostUZS: 100_000 }, USER);

    // 10 prior days: reportCost rising 99 000→99 900, expNet falling 104 000→102 200.
    const base = new Date("2026-05-01T00:00:00Z");
    for (let i = 0; i < 10; i++) {
      const d = new Date(base.getTime() + i * 86_400_000);
      await prisma.dailyUnitCost.create({
        data: {
          productId: p.id,
          date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
          baseUnit: new Prisma.Decimal(100_000),
          allocFixedCum: new Prisma.Decimal(0),
          reportCost: new Prisma.Decimal(99_000 + i * 100),
          decisionCost: new Prisma.Decimal(100_000),
          expNetPrice: new Prisma.Decimal(104_000 - i * 200),
        },
      });
    }
    // Today (05-11) computes reportCost≈100 000, expNet=102 000 → gap ~2000,
    // closing ~300/day → crosses in ~7 days (<30) → alert.
    const res = await snapshotAllCosts({ userId: USER, now: new Date("2026-05-11T00:00:00Z") });
    expect(res.alerts).toBeGreaterThanOrEqual(1);
    const notif = await prisma.notification.findFirst({
      where: { type: "BREAK_EVEN", refType: "Product", refId: p.id },
    });
    expect(notif).toBeTruthy();
    expect(notif!.linkUrl).toBe(`/costing/${p.id}`);
  });
});
