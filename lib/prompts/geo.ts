import { z } from "zod";

/**
 * Versioned GEO/SEO prompt (spec v2 §7.2). The version string is stored on every
 * GeoAnnotation so a recommendation can always be traced to the prompt that
 * produced it. Bump PROMPT_VERSION whenever the wording below changes.
 */
export const GEO_PROMPT_VERSION = "geo-v1";

export type GeoContext = {
  workTitle: string;
  language: string;
  authors: string[];
  description: string | null;
  keywords: string[];
  themaCodes: string[];
  isbn13?: string | null;
  format?: string | null;
  listPrice?: number | null;
};

export const GEO_SYSTEM = [
  "Sen O'zbekiston nashriyoti uchun GEO/SEO mutaxassisisan.",
  "Berilgan kitob ma'lumotidan qidiruv tizimlari va generativ qidiruv (GEO) uchun",
  "optimallashtirilgan metama'lumot va schema.org/Book JSON-LD tayyorlaysan.",
  "Til: kitob tilida yoz (odatda o'zbek).",
  "Faqat berilgan ma'lumotdan foydalanaman — muallif, narx, ISBN kabi ma'lumotni o'ylab topma.",
].join(" ");

/** Build the user message describing the title to annotate. */
export function buildGeoUserPrompt(ctx: GeoContext): string {
  const lines = [
    `Kitob: ${ctx.workTitle}`,
    `Til: ${ctx.language}`,
    ctx.authors.length ? `Mualliflar: ${ctx.authors.join(", ")}` : null,
    ctx.description ? `Tavsif: ${ctx.description}` : "Tavsif: (yo'q)",
    ctx.keywords.length ? `Mavjud kalit so'zlar: ${ctx.keywords.join(", ")}` : null,
    ctx.themaCodes.length ? `Thema kodlari: ${ctx.themaCodes.join(", ")}` : null,
    ctx.isbn13 ? `ISBN: ${ctx.isbn13}` : null,
    ctx.format ? `Format: ${ctx.format}` : null,
    ctx.listPrice != null ? `Narx (UZS): ${ctx.listPrice}` : null,
    "",
    "Quyidagi JSON sxemada javob ber:",
    "{",
    '  "metaTitle": "60 belgigacha, kitob nomi + asosiy kalit",',
    '  "metaDescription": "150-160 belgi, jozibali, kalit so\'zlar bilan",',
    '  "keywords": ["8-15 ta tegishli kalit so\'z"],',
    '  "blurb": "2-3 jumlalik marketing matni",',
    '  "jsonLd": { "@context": "https://schema.org", "@type": "Book", "name": "...", "inLanguage": "...", "author": [{"@type":"Person","name":"..."}] }',
    "}",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

// A permissive JSON-LD shape — we only require it to be an object; the model
// fills the schema.org fields. Stored verbatim as JSONB.
const jsonLdSchema = z.record(z.string(), z.unknown());

export const GeoResultSchema = z.object({
  metaTitle: z.string().min(1).max(120),
  metaDescription: z.string().min(1).max(400),
  keywords: z.array(z.string().min(1)).min(1).max(30),
  blurb: z.string().min(1).max(1200).optional().nullable(),
  jsonLd: jsonLdSchema,
});

export type GeoResult = z.infer<typeof GeoResultSchema>;

/**
 * Validate a raw model reply into a GeoResult. Throws a Zod error if the shape
 * is wrong so the service can degrade cleanly rather than persist garbage.
 */
export function parseGeoResult(raw: unknown): GeoResult {
  return GeoResultSchema.parse(raw);
}
