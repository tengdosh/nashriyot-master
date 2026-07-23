import { describe, it, expect } from "vitest";
import { generateOnix } from "@/lib/onix";

describe("onix 3.0", () => {
  it("emits a 3.0 message with title, ISBN, contributor and price", () => {
    const xml = generateOnix({
      isbn13: "9780306406157",
      title: "Sabr sharbati",
      format: "PAPERBACK",
      language: "uzb",
      contributors: [{ name: "Akmal Karimov", role: "AUTHOR" }],
      listPriceUZS: 45000,
      publisher: "Tasnim",
    });
    expect(xml).toContain('release="3.0"');
    expect(xml).toContain("<TitleText>Sabr sharbati</TitleText>");
    expect(xml).toContain("<IDValue>9780306406157</IDValue>");
    expect(xml).toContain("<ContributorRole>A01</ContributorRole>");
    expect(xml).toContain("<ProductForm>BC</ProductForm>");
    expect(xml).toContain("<CurrencyCode>UZS</CurrencyCode>");
    expect(xml).toContain("<PriceAmount>45000.00</PriceAmount>");
  });

  it("escapes XML special characters", () => {
    const xml = generateOnix({ title: 'A & B <c> "d"' });
    expect(xml).toContain("A &amp; B &lt;c&gt; &quot;d&quot;");
  });
});
