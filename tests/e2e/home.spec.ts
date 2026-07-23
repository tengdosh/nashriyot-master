import { test, expect } from "@playwright/test";

// Minimal smoke E2E. Requires `npx playwright install chromium` first.
test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Nashriyot-Master/i })).toBeVisible();
});
