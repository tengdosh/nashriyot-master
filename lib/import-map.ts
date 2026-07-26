/**
 * Pure import helpers (spec v2 §9): CSV parsing, Uzbek date/money coercion,
 * title-name normalization (latin/cyrill → one work), and the two import
 * templates (kirimlar = inbound catalog + FIFO, sotuv = historical sales).
 * No DB, no I/O — 100% unit-tested. The service layer feeds these the raw text.
 */

// ── CSV (RFC-4180-ish: quoted fields, escaped quotes, CR/LF) ─────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row unless the input ended on a clean newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank rows (e.g. a trailing empty line that slipped through).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ── Coercion ─────────────────────────────────────────────────────────────────────

/** dd.mm.yyyy or yyyy-mm-dd → UTC Date; null if unparseable. */
export function parseUzDate(s: string): Date | null {
  const t = s.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return mkDate(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  return null;
}

function mkDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow (e.g. 31.02 → Mar 03).
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Uzbek money text ("12 000 000", "1 200,50") → number; NaN if no digits. */
export function parseMoneyNum(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  if (!/\d/.test(cleaned)) return NaN;
  // Keep only the first decimal point.
  const parts = cleaned.split(".");
  const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

// Uzbek Cyrillic → Latin, enough to fold the same title written in either script.
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "", ь: "", ы: "i",
  э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h", "'": "", "ʻ": "", "ʼ": "",
};

/** A match key so latin/cyrillic spellings of one work collapse together. */
export function normalizeTitleKey(name: string): string {
  const lower = name.trim().toLowerCase();
  let out = "";
  for (const ch of lower) out += ch in CYR ? CYR[ch] : ch;
  return out.replace(/[^a-z0-9]/g, "");
}

/**
 * Deterministic import SKU. Script-PRESERVING (keeps the raw letters), so the
 * same work in latin vs cyrillic yields two distinct SKUs under one Title —
 * "bitta asar ikki SKU" (spec v2 §9). Re-importing the same spelling reuses it.
 */
export function importProductSku(rawName: string): string {
  const slug = rawName.trim().toLowerCase().replace(/[\s]+/gu, "-").replace(/[^\p{L}\p{N}-]/gu, "");
  return `IMP-${slug}`;
}

// ── Templates ─────────────────────────────────────────────────────────────────────

export type FieldType = "date" | "money" | "int" | "text";
export type FieldDef = { key: string; aliases: string[]; type: FieldType; required: boolean };
export type TemplateName = "kirimlar" | "sotuv";

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, "_").replace(/[^a-z0-9_]/g, "");

export const TEMPLATES: Record<TemplateName, { label: string; fields: FieldDef[] }> = {
  kirimlar: {
    label: "Kirimlar (katalog + FIFO)",
    fields: [
      { key: "date", aliases: ["sana"], type: "date", required: true },
      { key: "book", aliases: ["kitoblar", "kitob"], type: "text", required: true },
      { key: "qty", aliases: ["miqdor", "soni"], type: "int", required: true },
      { key: "price", aliases: ["narxi", "narx"], type: "money", required: false },
      { key: "discount", aliases: ["chegirma"], type: "money", required: false },
      { key: "unitCost", aliases: ["summa_dona", "summadona", "dona_narxi"], type: "money", required: true },
      { key: "total", aliases: ["umumiy", "summa"], type: "money", required: false },
      { key: "supplier", aliases: ["yetkazib_beruvchi", "yetkazibberuvchi", "taminotchi"], type: "text", required: true },
    ],
  },
  sotuv: {
    label: "Sotuv (hamkorlar + tarixiy buyurtmalar)",
    fields: [
      { key: "date", aliases: ["sana"], type: "date", required: true },
      { key: "client", aliases: ["klient", "mijoz"], type: "text", required: true },
      { key: "status", aliases: ["holat"], type: "text", required: true },
      { key: "book", aliases: ["kitoblar", "kitob"], type: "text", required: true },
      { key: "cost", aliases: ["kirim", "tannarx"], type: "money", required: false },
      { key: "price", aliases: ["sotuv_narxi", "sotuvnarxi", "narxi"], type: "money", required: true },
      { key: "qty", aliases: ["soni", "miqdor"], type: "int", required: true },
      { key: "discount", aliases: ["chegirma"], type: "money", required: false },
      { key: "extraCost", aliases: ["qoshimcha_xarajat", "qoshimchaxarajat"], type: "money", required: false },
      { key: "total", aliases: ["summa"], type: "money", required: false },
      { key: "profit", aliases: ["foyda"], type: "money", required: false },
    ],
  },
};

export type MappedRecord = Record<string, string | number | Date | null> & { _row: number };
export type RowError = { row: number; message: string };
export type MapResult = { records: MappedRecord[]; errors: RowError[]; missingHeaders: string[] };

/** Parse CSV rows → typed records for a template, collecting per-row errors. */
export function mapRows(template: TemplateName, rows: string[][]): MapResult {
  const def = TEMPLATES[template];
  const errors: RowError[] = [];
  if (rows.length === 0) return { records: [], errors: [{ row: 0, message: "Fayl bo'sh" }], missingHeaders: [] };

  const header = rows[0].map(normHeader);
  const colOf = new Map<string, number>();
  const missingHeaders: string[] = [];
  for (const f of def.fields) {
    const idx = header.findIndex((h) => f.aliases.includes(h));
    if (idx >= 0) colOf.set(f.key, idx);
    else if (f.required) missingHeaders.push(f.aliases[0]);
  }
  if (missingHeaders.length > 0) {
    return { records: [], errors: [{ row: 1, message: `Ustunlar yetishmayapti: ${missingHeaders.join(", ")}` }], missingHeaders };
  }

  const records: MappedRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    const rec: MappedRecord = { _row: r + 1 };
    let rowOk = true;
    for (const f of def.fields) {
      const idx = colOf.get(f.key);
      const cell = idx != null ? (raw[idx] ?? "").trim() : "";
      if (cell === "") {
        if (f.required) {
          errors.push({ row: r + 1, message: `"${f.aliases[0]}" bo'sh` });
          rowOk = false;
        }
        rec[f.key] = f.type === "money" || f.type === "int" ? 0 : null;
        continue;
      }
      if (f.type === "date") {
        const d = parseUzDate(cell);
        if (!d) {
          errors.push({ row: r + 1, message: `"${f.aliases[0]}" sana noto'g'ri: ${cell}` });
          rowOk = false;
        }
        rec[f.key] = d;
      } else if (f.type === "int" || f.type === "money") {
        const num = parseMoneyNum(cell);
        if (Number.isNaN(num)) {
          errors.push({ row: r + 1, message: `"${f.aliases[0]}" son emas: ${cell}` });
          rowOk = false;
          rec[f.key] = 0;
        } else {
          rec[f.key] = f.type === "int" ? Math.round(num) : num;
        }
      } else {
        rec[f.key] = cell;
      }
    }
    if (rowOk) records.push(rec);
  }
  return { records, errors, missingHeaders: [] };
}
