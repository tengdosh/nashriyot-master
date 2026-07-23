import { describe, it, expect } from "vitest";
import { formatNumber, formatUZS, formatDate, parseMoney } from "@/lib/format";

describe("format — money", () => {
  it("groups thousands with spaces and appends so'm", () => {
    expect(formatUZS(12000000)).toBe("12 000 000 so'm");
    expect(formatUZS(120778)).toBe("120 778 so'm");
    expect(formatUZS(217400)).toBe("217 400 so'm");
    expect(formatUZS(0)).toBe("0 so'm");
    expect(formatUZS("54350")).toBe("54 350 so'm");
  });

  it("formatNumber handles negatives and rounding", () => {
    expect(formatNumber(-1500)).toBe("-1 500");
    expect(formatNumber(1234.6)).toBe("1 235");
    expect(formatNumber(999)).toBe("999");
  });
});

describe("format — dates", () => {
  it("renders dd.mm.yyyy", () => {
    expect(formatDate(new Date(2026, 5, 30))).toBe("30.06.2026");
    expect(formatDate(new Date(2025, 0, 1))).toBe("01.01.2025");
  });
});

describe("format — parseMoney", () => {
  it("strips grouping and suffix", () => {
    expect(parseMoney("12 000 000 so'm")).toBe(12000000);
    expect(parseMoney("217 400")).toBe(217400);
  });
});
