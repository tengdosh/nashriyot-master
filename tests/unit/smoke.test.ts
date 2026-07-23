import { describe, it, expect } from "vitest";

// Sanity check that the unit-test harness is wired up. Real suites
// (finance, costing, royalty) arrive in later milestones.
describe("unit harness", () => {
  it("runs and asserts", () => {
    expect(1 + 1).toBe(2);
  });
});
