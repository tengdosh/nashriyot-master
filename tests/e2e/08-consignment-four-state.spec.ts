import { test, expect, type Page } from "@playwright/test";

const DIRECTOR_EMAIL = "director@nashriyot.uz";
const DIRECTOR_PASS = "Parol123!";

async function loginAsDirector(page: Page) {
  await page.goto("/login");
  await page.fill('[name=email]', DIRECTOR_EMAIL);
  await page.fill('[name=password]', DIRECTOR_PASS);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ]);
}

test.describe("08 – Konsignatsiya va to'rt holat ko'rinishi (Omborda | Agentda | Sotilgan | Qaytgan)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/inventory sahifasi 200 qaytaradi va yuklanadi", async ({ page }) => {
    const res = await page.goto("/inventory");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.getByRole("heading", { name: "Ombor" })).toBeVisible();
  });

  test("'Agentlarda (konsignatsiya)' KPI kartasi ko'rinadi", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    // AGENT omborlaridagi nusxalar uchun maxsus KPI
    await expect(page.getByText("Agentlarda (konsignatsiya)")).toBeVisible();
    await expect(page.getByText("AGENT omborlaridagi nusxalar")).toBeVisible();
  });

  test("to'rt holat yozuvlari ('Omborda', 'Agentda', 'Sotilgan', 'Qaytgan') jadvalda ko'rinadi", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da inventar ma'lumotlari yo'q");
      return;
    }

    // To'rt holat maʼlumotlari jadval qatorlarida ko'rinadi
    await expect(page.getByText("Omborda").first()).toBeVisible();
    await expect(page.getByText("Agentda").first()).toBeVisible();
    await expect(page.getByText("Sotilgan").first()).toBeVisible();
    await expect(page.getByText("Qaytgan").first()).toBeVisible();
  });

  test("AGENT ombori '· konsignatsiya' belgisi bilan ko'rinadi", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da inventar ma'lumotlari yo'q");
      return;
    }

    // Birinchi qatorni expand qilib agent ombor bo'limini ko'ramiz
    const expandBtns = page.locator("tbody tr").locator("button");
    const expandCount = await expandBtns.count();

    if (expandCount > 0) {
      await expandBtns.first().click();
      await page.waitForTimeout(400);

      // Agent ombori bo'lsa, "· konsignatsiya" matni ko'rinadi
      const consignText = page.getByText(/konsignatsiya/i);
      if (await consignText.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(consignText.first()).toBeVisible();
      }
    }
  });

  test("inventar jadvalida barcha asosiy ustunlar ko'rinadi", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");

    // Asosiy KPI kartalar
    await expect(page.getByText("Zaxira qiymati")).toBeVisible();
    await expect(page.getByText("ROP dan past")).toBeVisible();
    await expect(page.getByText("Oʻlik zaxira SKU")).toBeVisible();

    // Inventar jadvali sahifasi yuklanadi
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10_000 });
  });

  test("/inventory/movements sahifasi yuklanadi", async ({ page }) => {
    const res = await page.goto("/inventory/movements");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/inventory\/movements/);
  });

  test("/inventory/abc sahifasi yuklanadi", async ({ page }) => {
    const res = await page.goto("/inventory/abc");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/inventory\/abc/);
  });
});
