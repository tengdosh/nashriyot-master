import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { generateJson, claudeEnabled } from "@/lib/ai/claude";
import {
  GEO_PROMPT_VERSION,
  GEO_SYSTEM,
  buildGeoUserPrompt,
  parseGeoResult,
  type GeoContext,
} from "@/lib/prompts/geo";

/**
 * GEO/SEO recommendations (spec v2 §7.2). AI recommends → human approves → act:
 * `generate` persists a DRAFT, `approve` (ai.apply) writes it back to the live
 * title fields. Degrades cleanly (throws GeoUnavailableError) when no Claude key
 * is configured, so the page shows "AI mavjud emas" rather than crashing.
 */

export class GeoUnavailableError extends Error {
  constructor() {
    super("AI mavjud emas — ANTHROPIC_API_KEY sozlanmagan yoki so'rov muvaffaqiyatsiz");
    this.name = "GeoUnavailableError";
  }
}
export class GeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoError";
  }
}

export function geoEnabled(): boolean {
  return claudeEnabled();
}

async function titleContext(titleId: string): Promise<{ ctx: GeoContext }> {
  const t = await prisma.title.findUniqueOrThrow({
    where: { id: titleId },
    include: {
      contributors: { include: { contributor: { select: { fullName: true, role: true } } } },
      products: { select: { isbn13: true, format: true, listPrice: true }, take: 1 },
    },
  });
  const authors = t.contributors
    .filter((c) => c.role === "AUTHOR" || c.role === "CO_AUTHOR")
    .map((c) => c.contributor.fullName);
  const p = t.products[0];
  return {
    ctx: {
      workTitle: t.workTitle,
      language: t.language,
      authors,
      description: t.description,
      keywords: t.keywords,
      themaCodes: t.themaCodes,
      isbn13: p?.isbn13 ?? null,
      format: p?.format ?? null,
      listPrice: p ? new Prisma.Decimal(p.listPrice).toNumber() : null,
    },
  };
}

/** Generate a DRAFT GEO recommendation for a title (upserts, resetting status). */
export async function generateGeoRecommendation(titleId: string, userId: string) {
  if (!claudeEnabled()) throw new GeoUnavailableError();
  const { ctx } = await titleContext(titleId);

  const out = await generateJson(GEO_SYSTEM, buildGeoUserPrompt(ctx), { maxTokens: 2048 });
  if (!out) throw new GeoUnavailableError();

  const result = parseGeoResult(out.data); // throws on a malformed reply

  return runWithAudit({ userId }, async () =>
    prisma.geoAnnotation.upsert({
      where: { titleId },
      update: {
        status: "DRAFT",
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
        keywords: result.keywords,
        jsonLd: result.jsonLd as Prisma.InputJsonValue,
        blurb: result.blurb ?? null,
        promptVersion: GEO_PROMPT_VERSION,
        model: out.model,
        createdById: userId,
        approvedById: null,
        approvedAt: null,
      },
      create: {
        titleId,
        status: "DRAFT",
        metaTitle: result.metaTitle,
        metaDescription: result.metaDescription,
        keywords: result.keywords,
        jsonLd: result.jsonLd as Prisma.InputJsonValue,
        blurb: result.blurb ?? null,
        promptVersion: GEO_PROMPT_VERSION,
        model: out.model,
        createdById: userId,
      },
    }),
  );
}

/**
 * Approve a DRAFT recommendation (ai.apply): mark APPROVED and write the meta
 * description + keywords back to the title's live SEO fields.
 */
export async function approveGeoAnnotation(id: string, userId: string) {
  const geo = await prisma.geoAnnotation.findUniqueOrThrow({ where: { id } });
  if (geo.status === "APPROVED") throw new GeoError("Bu annotatsiya allaqachon tasdiqlangan");

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.geoAnnotation.update({
        where: { id },
        data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
      });
      await tx.title.update({
        where: { id: geo.titleId },
        data: { description: geo.metaDescription, keywords: geo.keywords },
      });
      return updated;
    }),
  );
}

export async function getGeoForTitle(titleId: string) {
  return prisma.geoAnnotation.findUnique({ where: { titleId } });
}

/** Current live SEO + latest recommendation, for the diff view. */
export async function getGeoDetail(titleId: string) {
  const [title, geo] = await Promise.all([
    prisma.title.findUniqueOrThrow({
      where: { id: titleId },
      select: { workTitle: true, description: true, keywords: true },
    }),
    prisma.geoAnnotation.findUnique({ where: { titleId } }),
  ]);
  return {
    current: { workTitle: title.workTitle, description: title.description, keywords: title.keywords },
    geo: geo
      ? {
          id: geo.id,
          status: geo.status,
          metaTitle: geo.metaTitle,
          metaDescription: geo.metaDescription,
          keywords: geo.keywords,
          blurb: geo.blurb,
          jsonLd: geo.jsonLd,
          model: geo.model,
          promptVersion: geo.promptVersion,
        }
      : null,
  };
}

/** Titles (OWN) with their GEO status for the /ai/geo picker. */
export async function listGeoTitles(take = 200) {
  const titles = await prisma.title.findMany({
    where: { archivedAt: null, ownerType: "OWN" },
    select: {
      id: true,
      workTitle: true,
      language: true,
      keywords: true,
      geoAnnotation: { select: { status: true, updatedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
  return titles.map((t) => ({
    id: t.id,
    workTitle: t.workTitle,
    language: t.language,
    keywordCount: t.keywords.length,
    geoStatus: t.geoAnnotation?.status ?? null,
  }));
}
