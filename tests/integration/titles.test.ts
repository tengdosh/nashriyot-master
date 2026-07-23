import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createTitle, transitionTitle, TransitionError } from "@/lib/services/title-service";
import {
  createEdition,
  createProduct,
  titleUniqueCost,
  searchTitles,
} from "@/lib/services/edition-service";

const USER = "user-editor";
const createdIds: string[] = [];

function base(workTitle: string, keywords: string[] = []) {
  return {
    workTitle,
    ownerType: "OWN" as const,
    entityId: "ent-tasnim",
    ownerPartnerId: null,
    language: "uz",
    seriesId: null,
    description: null,
    keywords,
    themaCodes: [],
    bisacCodes: [],
  };
}

async function mkTitle(workTitle: string, keywords: string[] = []) {
  const t = await createTitle(base(workTitle, keywords), USER);
  createdIds.push(t.id);
  return t;
}

describe("M2 — titles", () => {
  afterAll(async () => {
    for (const id of createdIds) {
      await prisma.auditLog.deleteMany({ where: { entity: "Title", entityId: id } });
      await prisma.product.deleteMany({ where: { titleId: id } });
      await prisma.costEntry.deleteMany({ where: { titleId: id } });
      await prisma.edition.deleteMany({ where: { titleId: id } });
      await prisma.title.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("full lifecycle DRAFT→REVIEW→APPROVED→ACTIVE→OUT_OF_PRINT", async () => {
    const t = await mkTitle("M2 hayot sikli");
    expect(t.status).toBe("DRAFT");
    expect((await transitionTitle(t.id, "REVIEW", USER)).status).toBe("REVIEW");
    expect((await transitionTitle(t.id, "APPROVED", USER)).status).toBe("APPROVED");
    expect((await transitionTitle(t.id, "ACTIVE", USER)).status).toBe("ACTIVE");
    expect((await transitionTitle(t.id, "OUT_OF_PRINT", USER)).status).toBe("OUT_OF_PRINT");
  });

  it("rejects an illegal transition (DRAFT→ACTIVE)", async () => {
    const t = await mkTitle("Notoʻgʻri oʻtish");
    await expect(transitionTitle(t.id, "ACTIVE", USER)).rejects.toBeInstanceOf(TransitionError);
  });

  it("backward transition requires a reason, recorded in audit_log", async () => {
    const t = await mkTitle("Orqaga qaytish");
    await transitionTitle(t.id, "REVIEW", USER);
    await expect(transitionTitle(t.id, "DRAFT", USER)).rejects.toBeInstanceOf(TransitionError);
    await transitionTitle(t.id, "DRAFT", USER, "Sarlavha notoʻgʻri");
    expect((await prisma.title.findUnique({ where: { id: t.id } }))?.status).toBe("DRAFT");
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Title", entityId: t.id },
      orderBy: { createdAt: "desc" },
    });
    expect((audit?.after as { reason?: string })?.reason).toBe("Sarlavha notoʻgʻri");
  });

  it("2nd edition: SKUs link to the correct editionId", async () => {
    const t = await mkTitle("Ikki nashr");
    const ed1 = await createEdition({ titleId: t.id, plannedRun: 5000 }, USER);
    expect(ed1.editionNo).toBe(1);
    const sku1 = await createProduct(
      { titleId: t.id, editionId: ed1.id, format: "PAPERBACK", listPrice: 45000, vatRate: 0 },
      USER,
    );

    const ed2 = await createEdition({ titleId: t.id, plannedRun: 7000 }, USER);
    expect(ed2.editionNo).toBe(2);
    const sku2 = await createProduct(
      { titleId: t.id, editionId: ed2.id, format: "HARDCOVER", listPrice: 60000, vatRate: 0 },
      USER,
    );

    expect(sku1.editionId).toBe(ed1.id);
    expect(sku2.editionId).toBe(ed2.id);
    const ed1Products = await prisma.product.findMany({ where: { editionId: ed1.id }, select: { id: true } });
    const ed2Products = await prisma.product.findMany({ where: { editionId: ed2.id }, select: { id: true } });
    expect(ed1Products.map((p) => p.id)).toEqual([sku1.id]);
    expect(ed2Products.map((p) => p.id)).toEqual([sku2.id]);
    expect(await prisma.edition.count({ where: { titleId: t.id } })).toBe(2);
  });

  it("cost mini-panel sums TITLE-scope entries only (unique load)", async () => {
    const t = await mkTitle("Xarajatli");
    await prisma.costEntry.create({
      data: { scope: "TITLE", category: "TARJIMA", titleId: t.id, amount: 10_000_000, currency: "UZS", rate: 1, amountUZS: 10_000_000, date: new Date() },
    });
    await prisma.costEntry.create({
      data: { scope: "TITLE", category: "TAHRIR", titleId: t.id, amount: 8_000_000, currency: "UZS", rate: 1, amountUZS: 8_000_000, date: new Date() },
    });
    // EDITION-scope cost must NOT count toward the unique load
    await prisma.costEntry.create({
      data: { scope: "EDITION", category: "BOSMA", titleId: t.id, amount: 5_000_000, currency: "UZS", rate: 1, amountUZS: 5_000_000, date: new Date() },
    });
    expect(Number(await titleUniqueCost(t.id))).toBe(18_000_000);
  });

  it("⌘K tsvector search finds by keyword, honours entity scope", async () => {
    const t = await mkTitle("Qidiruv nashri", ["noyobkalit"]);
    const found = await searchTitles("noyobkalit", ["ent-tasnim"]);
    expect(found.some((f) => f.id === t.id)).toBe(true);
    const scoped = await searchTitles("noyobkalit", ["ent-tahlil"]);
    expect(scoped.some((f) => f.id === t.id)).toBe(false);
  });
});
