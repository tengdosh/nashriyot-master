import { describe, it, expect } from "vitest";
import {
  GEO_PROMPT_VERSION,
  GEO_SYSTEM,
  buildGeoUserPrompt,
  parseGeoResult,
  type GeoContext,
} from "@/lib/prompts/geo";
import { extractJson } from "@/lib/ai/claude";

const full: GeoContext = {
  workTitle: "O'tkan kunlar",
  language: "uz",
  authors: ["Abdulla Qodiriy"],
  description: "Tarixiy roman",
  keywords: ["roman", "tarix"],
  themaCodes: ["FBA"],
  isbn13: "9789943010101",
  format: "PAPERBACK",
  listPrice: 65000,
};

const minimal: GeoContext = {
  workTitle: "Sarob",
  language: "uz",
  authors: [],
  description: null,
  keywords: [],
  themaCodes: [],
};

describe("geo prompt", () => {
  it("has a stable version and non-empty system prompt", () => {
    expect(GEO_PROMPT_VERSION).toMatch(/^geo-/);
    expect(GEO_SYSTEM.length).toBeGreaterThan(20);
  });

  it("includes every provided optional field", () => {
    const p = buildGeoUserPrompt(full);
    expect(p).toContain("O'tkan kunlar");
    expect(p).toContain("Abdulla Qodiriy");
    expect(p).toContain("Tarixiy roman");
    expect(p).toContain("roman, tarix");
    expect(p).toContain("FBA");
    expect(p).toContain("9789943010101");
    expect(p).toContain("PAPERBACK");
    expect(p).toContain("65000");
  });

  it("omits absent optionals and marks description empty", () => {
    const p = buildGeoUserPrompt(minimal);
    expect(p).toContain("Sarob");
    expect(p).toContain("Tavsif: (yo'q)");
    expect(p).not.toContain("Mualliflar:");
    expect(p).not.toContain("ISBN:");
    expect(p).not.toContain("Narx");
  });
});

describe("parseGeoResult", () => {
  it("accepts a well-formed result (with and without blurb)", () => {
    const base = {
      metaTitle: "O'tkan kunlar — Abdulla Qodiriy",
      metaDescription: "Abdulla Qodiriyning mashhur tarixiy romani.",
      keywords: ["roman", "tarix"],
      jsonLd: { "@context": "https://schema.org", "@type": "Book", name: "O'tkan kunlar" },
    };
    expect(parseGeoResult(base).blurb).toBeUndefined();
    expect(parseGeoResult({ ...base, blurb: "Ajoyib kitob." }).blurb).toBe("Ajoyib kitob.");
  });

  it("rejects a malformed result", () => {
    expect(() => parseGeoResult({ metaTitle: "x" })).toThrow();
    expect(() => parseGeoResult({ ...{ metaTitle: "x", metaDescription: "y", keywords: [] }, jsonLd: {} })).toThrow(); // empty keywords
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses a fenced JSON block with surrounding prose", () => {
    expect(extractJson('Mana natija:\n```json\n{"a":2}\n```\nrahmat')).toEqual({ a: 2 });
  });
  it("parses an object embedded in loose text", () => {
    expect(extractJson('prefix {"a":3} suffix')).toEqual({ a: 3 });
  });
  it("throws when there is no JSON object", () => {
    expect(() => extractJson("hech narsa yo'q")).toThrow();
  });
});
