import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseUzDate,
  parseMoneyNum,
  normalizeTitleKey,
  importProductSku,
  mapRows,
} from "@/lib/import-map";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, commas and CRLF", () => {
    const csv = 'a,b\r\n"x,y","he said ""hi""",z\n';
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["x,y", 'he said "hi"', "z"],
    ]);
  });

  it("flushes a trailing field with no final newline", () => {
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
    expect(parseCsv("a,")).toEqual([["a", ""]]);
  });

  it("drops fully blank lines", () => {
    expect(parseCsv("a\n\n \nb")).toEqual([["a"], ["b"]]);
  });
});

describe("parseUzDate", () => {
  it("parses dd.mm.yyyy and yyyy-mm-dd", () => {
    expect(parseUzDate("26.07.2026")?.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(parseUzDate("2026-07-26")?.toISOString()).toBe("2026-07-26T00:00:00.000Z");
  });
  it("rejects bad months, overflow days and garbage", () => {
    expect(parseUzDate("31.02.2026")).toBeNull(); // overflow
    expect(parseUzDate("00.13.2026")).toBeNull(); // bad month/day
    expect(parseUzDate("hello")).toBeNull();
  });
});

describe("parseMoneyNum", () => {
  it("strips spaces and treats comma as decimal", () => {
    expect(parseMoneyNum("12 000 000")).toBe(12_000_000);
    expect(parseMoneyNum("1 200,50")).toBe(1200.5);
    expect(parseMoneyNum("-500")).toBe(-500);
  });
  it("collapses multiple dots and returns NaN when there is no number", () => {
    expect(parseMoneyNum("1.2.3")).toBe(1.23);
    expect(parseMoneyNum("so'm")).toBeNaN();
    expect(parseMoneyNum("1-2")).toBeNaN();
  });
});

describe("normalizeTitleKey", () => {
  it("folds latin and cyrillic spellings of one work together", () => {
    expect(normalizeTitleKey("O'tkan kunlar")).toBe("otkankunlar");
    expect(normalizeTitleKey("Ўткан кунлар")).toBe("otkankunlar");
  });
  it("keeps distinct works distinct", () => {
    expect(normalizeTitleKey("Sarob")).not.toBe(normalizeTitleKey("Mehrobdan chayon"));
  });
});

describe("importProductSku", () => {
  it("is deterministic and script-preserving (latin vs cyrillic → two SKUs)", () => {
    expect(importProductSku("O'tkan kunlar")).toBe(importProductSku(" o'tkan kunlar "));
    expect(importProductSku("Sarob")).toBe("IMP-sarob");
    expect(importProductSku("Ўткан кунлар")).not.toBe(importProductSku("O'tkan kunlar"));
  });
});

const KIRIM_HEADER = "Sana,Kitoblar,Miqdor,Narxi,Chegirma,Summa_dona,Umumiy,Yetkazib beruvchi";

describe("mapRows — kirimlar", () => {
  it("maps valid rows and coerces types", () => {
    const csv = `${KIRIM_HEADER}\n26.07.2026,Sarob,100,20000,0,15000,1500000,Qamar bosmaxonasi`;
    const { records, errors } = mapRows("kirimlar", parseCsv(csv));
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ book: "Sarob", qty: 100, unitCost: 15000, supplier: "Qamar bosmaxonasi", _row: 2 });
    expect((records[0].date as Date).toISOString()).toBe("2026-07-26T00:00:00.000Z");
  });

  it("reports empty file, missing headers, and per-row errors", () => {
    expect(mapRows("kirimlar", []).errors[0].message).toBe("Fayl bo'sh");

    const missing = mapRows("kirimlar", parseCsv("Sana,Kitoblar\n26.07.2026,Sarob"));
    expect(missing.missingHeaders).toContain("miqdor");

    const bad = mapRows(
      "kirimlar",
      parseCsv(`${KIRIM_HEADER}\n,Sarob,abc,,0,15000,,Qamar\n26.07.2026,Sarob,100,,0,15000,,Qamar`),
    );
    // row 2: empty date (required) + non-numeric qty → excluded; row 3 is valid
    expect(bad.records).toHaveLength(1);
    expect(bad.errors.some((e) => /sana/i.test(e.message))).toBe(true);
    expect(bad.errors.some((e) => /son emas/i.test(e.message))).toBe(true);
  });

  it("accepts empty optional columns as defaults", () => {
    const csv = `Sana,Kitoblar,Miqdor,Summa_dona,Yetkazib beruvchi\n26.07.2026,Sarob,50,15000,Qamar`;
    const { records, errors } = mapRows("kirimlar", parseCsv(csv));
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ price: 0, discount: 0, total: 0 });
  });
});

describe("mapRows — sotuv", () => {
  it("maps sales rows with header aliasing (case/underscore/space)", () => {
    const csv =
      "sana,klient,holat,kitob,kirim,sotuv narxi,soni,chegirma,summa\n" +
      "26.07.2026,Akmal,Ulgurji,Sarob,15000,25000,10,0.1,225000";
    const { records, errors } = mapRows("sotuv", parseCsv(csv));
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ client: "Akmal", status: "Ulgurji", price: 25000, qty: 10, cost: 15000, discount: 0.1 });
  });

  it("tolerates a data row shorter than the header (trailing optional cell absent)", () => {
    const csv =
      "Sana,Klient,Holat,Kitoblar,Sotuv_narxi,Soni,Summa\n" +
      "26.07.2026,Akmal,Chakana,Sarob,25000,3"; // no trailing Summa cell
    const { records, errors } = mapRows("sotuv", parseCsv(csv));
    expect(errors).toEqual([]);
    expect(records[0]).toMatchObject({ client: "Akmal", qty: 3, total: 0 });
  });

  it("flags a bad date row and keeps the rest", () => {
    const csv =
      "Sana,Klient,Holat,Kitoblar,Sotuv_narxi,Soni\n" +
      "notdate,Akmal,Chakana,Sarob,25000,3\n" +
      "26.07.2026,Bahodir,Chakana,Sarob,25000,3";
    const { records, errors } = mapRows("sotuv", parseCsv(csv));
    expect(records).toHaveLength(1);
    expect(records[0].client).toBe("Bahodir");
    expect(errors.some((e) => /sana noto'g'ri/i.test(e.message))).toBe(true);
  });
});
