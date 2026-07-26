import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateGeoRecommendation,
  approveGeoAnnotation,
  getGeoDetail,
  listGeoTitles,
  geoEnabled,
  GeoUnavailableError,
  GeoError,
} from "@/lib/services/geo-service";

const USER = "user-director";
let titleId = "";

beforeAll(async () => {
  const t = await prisma.title.create({
    data: {
      workTitle: "GEOTEST kitob",
      ownerType: "OWN",
      entityId: "ent-tasnim",
      language: "uz",
      description: "eski tavsif",
      keywords: ["eski"],
      themaCodes: [],
      bisacCodes: [],
    },
  });
  titleId = t.id;
});

afterAll(async () => {
  await prisma.geoAnnotation.deleteMany({ where: { titleId } });
  await prisma.title.deleteMany({ where: { id: titleId } });
});

describe("M17 — GEO", () => {
  it("degrades when no Claude key is configured", async () => {
    // The test env has no ANTHROPIC_API_KEY.
    expect(geoEnabled()).toBe(false);
    await expect(generateGeoRecommendation(titleId, USER)).rejects.toThrow(GeoUnavailableError);
  });

  it("approves a DRAFT and writes it back to the title (recommend → approve → act)", async () => {
    const draft = await prisma.geoAnnotation.create({
      data: {
        titleId,
        status: "DRAFT",
        metaTitle: "GEOTEST kitob — sarlavha",
        metaDescription: "Yangi jozibali meta tavsif.",
        keywords: ["yangi", "kalit"],
        jsonLd: { "@context": "https://schema.org", "@type": "Book", name: "GEOTEST kitob" },
        blurb: "Ajoyib.",
        promptVersion: "geo-v1",
        model: "test",
        createdById: USER,
      },
    });

    const detailBefore = await getGeoDetail(titleId);
    expect(detailBefore.current.description).toBe("eski tavsif");
    expect(detailBefore.geo?.status).toBe("DRAFT");

    const approved = await approveGeoAnnotation(draft.id, USER);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(USER);

    const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } });
    expect(title.description).toBe("Yangi jozibali meta tavsif.");
    expect(title.keywords).toEqual(["yangi", "kalit"]);

    // can't approve twice
    await expect(approveGeoAnnotation(draft.id, USER)).rejects.toThrow(GeoError);
  });

  it("lists titles with their GEO status", async () => {
    const rows = await listGeoTitles();
    const row = rows.find((r) => r.id === titleId);
    expect(row).toBeDefined();
    expect(row!.geoStatus).toBe("APPROVED");
  });
});
