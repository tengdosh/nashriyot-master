import { describe, it, expect } from "vitest";
import { visibleTabs } from "@/lib/title-tabs";

describe("title 360° tabs by ownerType", () => {
  it("OWN shows all 9 tabs including nashrlar + xarajatlar", () => {
    const keys = visibleTabs("OWN").map((t) => t.key);
    expect(keys).toHaveLength(9);
    expect(keys).toContain("nashrlar");
    expect(keys).toContain("xarajatlar");
  });

  it("EXTERNAL hides nashrlar + xarajatlar (7 tabs)", () => {
    const keys = visibleTabs("EXTERNAL").map((t) => t.key);
    expect(keys).toHaveLength(7);
    expect(keys).not.toContain("nashrlar");
    expect(keys).not.toContain("xarajatlar");
    expect(keys).toContain("formatlar");
  });
});
