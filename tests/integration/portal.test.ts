import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import { createSalesOrder, confirmSalesOrder, shipSalesOrder } from "@/lib/services/sales-service";
import { createContract, activateContract } from "@/lib/services/contract-service";
import { runRoyalty, approveRoyaltyRun, sendRoyaltyRun } from "@/lib/services/royalty-service";
import {
  portalOverview,
  portalStatements,
  portalBooks,
  portalStatementForContributor,
  signReportToken,
  verifyReportToken,
  PortalError,
} from "@/lib/services/portal-service";

const MAKER = "user-sales";
const CHECKER = "user-director";
const MAIN = "wh-tasnim-main";
const OWN_STORE = "chan-ownstore";
const ENTITY = "ent-tasnim";
const NOW = new Date("2027-02-01T00:00:00Z");

/** Two independent authors, each with their own title, contract and sales. */
type Author = { contributorId: string; titleId: string; productId: string; contractId: string };

const created = {
  contributors: [] as string[],
  titles: [] as string[],
  products: [] as string[],
  orders: [] as string[],
  contracts: [] as string[],
  runs: [] as string[],
};

async function setupAuthor(name: string, listPrice: number): Promise<Author> {
  const c = await prisma.contributor.create({ data: { fullName: name, role: "AUTHOR" } });
  created.contributors.push(c.id);
  const t = await prisma.title.create({
    data: {
      workTitle: `${name} kitobi`,
      ownerType: "OWN",
      entityId: ENTITY,
      language: "uz",
      keywords: [],
      themaCodes: [],
      bisacCodes: [],
    },
  });
  created.titles.push(t.id);
  await prisma.titleContributor.create({
    data: { titleId: t.id, contributorId: c.id, role: "AUTHOR", shareRate: new Prisma.Decimal(1) },
  });
  const e = await prisma.edition.create({
    data: { titleId: t.id, editionNo: 1, plannedRun: 10_000, status: "ACTIVE" },
  });
  const p = await prisma.product.create({
    data: {
      titleId: t.id,
      editionId: e.id,
      format: "PAPERBACK",
      listPrice: new Prisma.Decimal(listPrice),
      vatRate: new Prisma.Decimal(0),
    },
  });
  created.products.push(p.id);
  const contract = await createContract(
    {
      contributorId: c.id,
      titleId: t.id,
      type: "ROYALTY",
      advanceAmount: 0,
      // Reserve is 0 here so a zero-sales period is skipped, keeping the
      // isolation assertions clean. Reserve mechanics are covered in royalty.test.ts.
      reserveRate: 0,
      audioRights: false,
      tiers: [{ fromUnits: 0, toUnits: null, rate: 0.1, basis: "LIST" }],
    },
    MAKER,
  );
  created.contracts.push(contract.id);
  await activateContract(contract.id, MAKER);
  return { contributorId: c.id, titleId: t.id, productId: p.id, contractId: contract.id };
}

async function shipInto(pid: string, qty: number, when: Date, price: number) {
  await stockInTx({ productId: pid, warehouseId: MAIN, qty, unitCostUZS: 20_000 }, MAKER);
  const { order } = await createSalesOrder(
    {
      channelId: OWN_STORE,
      entityId: ENTITY,
      warehouseId: MAIN,
      customerName: "Portal testi",
      lines: [{ productId: pid, qty, unitPrice: price, discountRate: 0 }],
    },
    MAKER,
  );
  created.orders.push(order.id);
  await confirmSalesOrder(order.id, MAKER);
  await shipSalesOrder(order.id, MAKER);
  await prisma.salesOrder.update({ where: { id: order.id }, data: { shippedDate: when } });
}

let alice: Author;
let bob: Author;

describe("M8 — muallif portali (row-level izolyatsiya)", () => {
  beforeAll(async () => {
    alice = await setupAuthor("PORTAL Alisa", 100_000);
    bob = await setupAuthor("PORTAL Bobur", 50_000);

    // Alice: 1 000 sold in 2024-H1 → SENT.
    await shipInto(alice.productId, 1000, new Date("2024-03-01T00:00:00Z"), 100_000);
    const ar = await runRoyalty("2024-H1", MAKER, NOW);
    created.runs.push(ar.runId);
    await approveRoyaltyRun(ar.runId, CHECKER);
    await sendRoyaltyRun(ar.runId, MAKER);

    // Bob: 2 000 sold in 2024-H2 → SENT.
    await shipInto(bob.productId, 2000, new Date("2024-09-01T00:00:00Z"), 50_000);
    const br = await runRoyalty("2024-H2", MAKER, NOW);
    created.runs.push(br.runId);
    await approveRoyaltyRun(br.runId, CHECKER);
    await sendRoyaltyRun(br.runId, MAKER);
  });

  afterAll(async () => {
    await prisma.royaltyStatement.deleteMany({ where: { contractId: { in: created.contracts } } });
    await prisma.royaltyRun.deleteMany({ where: { id: { in: created.runs } } });
    await prisma.royaltyTier.deleteMany({ where: { contractId: { in: created.contracts } } });
    await prisma.costEntry.deleteMany({ where: { titleId: { in: created.titles } } });
    await prisma.contract.deleteMany({ where: { id: { in: created.contracts } } });
    await prisma.receivable.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { refType: "SalesOrder", refId: { in: created.orders } },
          { refType: "Product", refId: { in: created.products } },
          { refType: "RoyaltyRun", refId: { in: created.runs } },
        ],
      },
    });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.inventoryItem.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.titleContributor.deleteMany({ where: { contributorId: { in: created.contributors } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.edition.deleteMany({ where: { titleId: { in: created.titles } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...created.titles, ...created.products, ...created.orders, ...created.contracts] } },
    });
    await prisma.title.deleteMany({ where: { id: { in: created.titles } } });
    await prisma.contributor.deleteMany({ where: { id: { in: created.contributors } } });
    await prisma.$disconnect();
  });

  // ── Row-level isolation ───────────────────────────────────────────────────────
  it("each author's statements contain ONLY their own rows", async () => {
    const aStmts = await portalStatements(alice.contributorId);
    const bStmts = await portalStatements(bob.contributorId);

    expect(aStmts).toHaveLength(1);
    expect(bStmts).toHaveLength(1);
    expect(aStmts[0].period).toBe("2024-H1");
    expect(aStmts[0].workTitle).toContain("Alisa");
    expect(bStmts[0].period).toBe("2024-H2");
    expect(bStmts[0].workTitle).toContain("Bobur");

    // No cross-contamination in either direction.
    expect(aStmts.some((s) => s.workTitle.includes("Bobur"))).toBe(false);
    expect(bStmts.some((s) => s.workTitle.includes("Alisa"))).toBe(false);
  });

  it("each author's overview and books are scoped to them", async () => {
    const aO = await portalOverview(alice.contributorId);
    const bO = await portalOverview(bob.contributorId);
    // Alice: 1000 × 100 000 × 10% = 10 000 000. Bob: 2000 × 50 000 × 10% = 10 000 000.
    expect(aO.totalEarned.toNumber()).toBe(10_000_000);
    expect(aO.totalNetUnits).toBe(1000);
    expect(bO.totalNetUnits).toBe(2000);
    expect(aO.periods).toBe(1);
    expect(bO.periods).toBe(1);

    const aBooks = await portalBooks(alice.contributorId);
    expect(aBooks).toHaveLength(1);
    expect(aBooks[0].workTitle).toContain("Alisa");
    expect(aBooks[0].lifetimeNetUnits).toBe(1000);
    expect(aBooks.some((b) => b.workTitle.includes("Bobur"))).toBe(false);
  });

  // ── SENT-only visibility ──────────────────────────────────────────────────────
  it("a run that is NOT sent (DRAFT/APPROVED) is invisible in the portal", async () => {
    // Ship more for Alice in a fresh period and leave the run APPROVED (not SENT).
    await shipInto(alice.productId, 500, new Date("2025-03-01T00:00:00Z"), 100_000);
    const run = await runRoyalty("2025-H1", MAKER, NOW);
    created.runs.push(run.runId);

    // DRAFT → invisible.
    expect(await portalStatements(alice.contributorId)).toHaveLength(1);

    await approveRoyaltyRun(run.runId, CHECKER);
    // APPROVED but not SENT → still invisible.
    const afterApprove = await portalStatements(alice.contributorId);
    expect(afterApprove).toHaveLength(1);
    expect(afterApprove[0].period).toBe("2024-H1");
    const ov = await portalOverview(alice.contributorId);
    expect(ov.totalNetUnits).toBe(1000); // the 500 are not counted yet

    await sendRoyaltyRun(run.runId, MAKER);
    // SENT → now visible.
    const afterSend = await portalStatements(alice.contributorId);
    expect(afterSend).toHaveLength(2);
    expect(afterSend.map((s) => s.period).sort()).toEqual(["2024-H1", "2025-H1"]);
    expect((await portalOverview(alice.contributorId)).totalNetUnits).toBe(1500);
  });

  // ── The authoritative access check ────────────────────────────────────────────
  it("portalStatementForContributor refuses another author's statement", async () => {
    const aStmt = (await portalStatements(alice.contributorId))[0];

    // Alice can open her own.
    const ok = await portalStatementForContributor(aStmt.id, alice.contributorId);
    expect(ok.contract.contributor.fullName).toContain("Alisa");

    // Bob cannot open Alice's — same generic error as if it did not exist.
    await expect(
      portalStatementForContributor(aStmt.id, bob.contributorId),
    ).rejects.toBeInstanceOf(PortalError);
  });

  // ── Signed download tokens ────────────────────────────────────────────────────
  it("a signed token verifies for its owner and is rejected across authors / when tampered / expired", async () => {
    const aStmt = (await portalStatements(alice.contributorId))[0];
    const now = Date.now();
    const token = signReportToken(aStmt.id, alice.contributorId, now);

    const v = verifyReportToken(token, now + 60_000);
    expect(v).not.toBeNull();
    expect(v!.statementId).toBe(aStmt.id);
    expect(v!.contributorId).toBe(alice.contributorId);

    // Expired.
    expect(verifyReportToken(token, now + 16 * 60_000)).toBeNull();

    // Tampered signature.
    expect(verifyReportToken(token.slice(0, -2) + "xy", now + 60_000)).toBeNull();
    // Tampered payload (flip a char in the base64url payload).
    const dot = token.lastIndexOf(".");
    const badPayload = "A" + token.slice(1, dot) + token.slice(dot);
    expect(verifyReportToken(badPayload, now + 60_000)).toBeNull();
    // Garbage.
    expect(verifyReportToken("not-a-token", now)).toBeNull();
    expect(verifyReportToken("", now)).toBeNull();

    // A token minted for Bob verifies as Bob — the DB check then blocks him from
    // Alice's statement (covered above via portalStatementForContributor).
    const bobToken = signReportToken(aStmt.id, bob.contributorId, now);
    const bv = verifyReportToken(bobToken, now + 60_000);
    expect(bv!.contributorId).toBe(bob.contributorId);
    await expect(
      portalStatementForContributor(bv!.statementId, bv!.contributorId),
    ).rejects.toBeInstanceOf(PortalError);
  });
});
