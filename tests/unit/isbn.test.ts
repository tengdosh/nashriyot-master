import { describe, it, expect } from "vitest";
import { isValidIsbn13, isbn13CheckDigit, formatIsbn13 } from "@/lib/isbn";

describe("isbn-13", () => {
  it("accepts a valid ISBN-13 (dashes ignored)", () => {
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
  });

  it("rejects a bad checksum or wrong length", () => {
    expect(isValidIsbn13("9780306406158")).toBe(false);
    expect(isValidIsbn13("123")).toBe(false);
    expect(isValidIsbn13("")).toBe(false);
  });

  it("computes the check digit", () => {
    expect(isbn13CheckDigit("978030640615")).toBe(7);
  });

  it("formats with dashes", () => {
    expect(formatIsbn13("9789943012345")).toBe("978-9943-01-234-5");
  });
});
