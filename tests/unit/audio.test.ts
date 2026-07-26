import { describe, it, expect } from "vitest";
import { splitIntoChapters, estimateDuration, jobProgress } from "@/lib/audio";

describe("splitIntoChapters", () => {
  it("returns empty for blank input", () => {
    expect(splitIntoChapters("")).toEqual([]);
    expect(splitIntoChapters("   \n  ")).toEqual([]);
  });

  it("splits on markdown headings, capturing a preamble", () => {
    const text = "muqaddima matni\n# Birinchi bob\nbir matni\n## Ikkinchi\nikki matni";
    const ch = splitIntoChapters(text);
    expect(ch.map((c) => c.heading)).toEqual(["Kirish", "Birinchi bob", "Ikkinchi"]);
    expect(ch[1].text).toBe("bir matni");
    expect(ch[1].charCount).toBe("bir matni".length);
  });

  it("splits on 'Bob' markers with no preamble", () => {
    const text = "Bob 1\nbir\nBob 2\nikki";
    const ch = splitIntoChapters(text);
    expect(ch.map((c) => c.heading)).toEqual(["Bob 1", "Bob 2"]);
  });

  it("packs paragraphs up to maxChars when there are no markers", () => {
    const p = (n: number) => "x".repeat(n);
    const text = `${p(50)}\n\n${p(50)}\n\n${p(50)}`;
    const ch = splitIntoChapters(text, 120); // 2 paras fit (~102), 3rd overflows
    expect(ch.length).toBe(2);
    expect(ch[0].heading).toBe("Qism 1");
    expect(ch[1].heading).toBe("Qism 2");
  });

  it("keeps a single markerless chapter when it fits", () => {
    const ch = splitIntoChapters("qisqa matn", 6000);
    expect(ch).toHaveLength(1);
    expect(ch[0].heading).toBe("Qism 1");
  });

  it("drops an empty chapter from consecutive headings", () => {
    const ch = splitIntoChapters("# A\n# B\nbtext");
    expect(ch.map((c) => c.heading)).toEqual(["B"]); // empty "A" dropped
  });

  it("keeps a lone heading with empty body (single-chapter guard)", () => {
    const ch = splitIntoChapters("# Faqat sarlavha");
    expect(ch).toHaveLength(1);
    expect(ch[0].heading).toBe("Faqat sarlavha");
    expect(ch[0].text).toBe("");
  });
});

describe("estimateDuration", () => {
  it("scales with length and floors at 1s for non-empty", () => {
    expect(estimateDuration(0)).toBe(0);
    expect(estimateDuration(-5)).toBe(0);
    expect(estimateDuration(5)).toBe(1); // 5/15 rounds to 0 → floored to 1
    expect(estimateDuration(1500)).toBe(100); // 1500/15
  });
});

describe("jobProgress", () => {
  it("is all-zero / 0% for an empty job", () => {
    expect(jobProgress([])).toEqual({ total: 0, synthesized: 0, failed: 0, queued: 0, pct: 0 });
  });

  it("counts statuses and computes percent", () => {
    const p = jobProgress([
      { status: "SYNTHESIZED" },
      { status: "SYNTHESIZED" },
      { status: "FAILED" },
      { status: "QUEUED" },
    ]);
    expect(p).toEqual({ total: 4, synthesized: 2, failed: 1, queued: 1, pct: 50 });
  });
});
