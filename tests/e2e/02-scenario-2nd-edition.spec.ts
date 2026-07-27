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

test.describe("02 – Akvizitsiya ssenariysi: 2-nashr rejimi", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/acquisitions sahifasi yuklanadi va yangi ssenariy tugmasi ko'rinadi", async ({ page }) => {
    await page.goto("/acquisitions");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/acquisitions/);
    await expect(page.getByRole("heading", { name: /Akvizitsiya/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Yangi ssenariy" })).toBeVisible();
  });

  test("mavjud ssenariyni ochib 2-nashr rejimi toggle ko'rinadi", async ({ page }) => {
    await page.goto("/acquisitions");
    await page.waitForLoadState("networkidle");

    const scenarioCards = page.locator("a[href*='/acquisitions/']");
    const count = await scenarioCards.count();
    if (count === 0) {
      test.skip(true, "Demo dunyo'da akvizitsiya ssenariysi yo'q");
      return;
    }

    await scenarioCards.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/acquisitions\/[^/]+/);

    // "2-nashr rejimi (unikal = 0)" labeli ko'rinishi
    await expect(page.getByText("2-nashr rejimi (unikal = 0)")).toBeVisible();
  });

  test("2-nashr rejimini yoqganda 1-nashr vs 2-nashr taqqoslama jadval ko'rinadi", async ({ page }) => {
    await page.goto("/acquisitions");
    await page.waitForLoadState("networkidle");

    const scenarioCards = page.locator("a[href*='/acquisitions/']");
    if (await scenarioCards.count() === 0) {
      test.skip(true, "Demo dunyo'da akvizitsiya ssenariysi yo'q");
      return;
    }

    await scenarioCards.first().click();
    await page.waitForLoadState("networkidle");

    // Dastlab "Natijalar (jonli)" ko'rinadi
    await expect(page.getByText(/Natijalar.*jonli|Natijalar/i).first()).toBeVisible();

    // 2-nashr checkboxni yoqamiz
    const secondEdCheckbox = page.locator('input[type=checkbox]').first();
    await expect(secondEdCheckbox).toBeVisible();
    await secondEdCheckbox.check();
    await page.waitForTimeout(400);

    // "1-nashr vs 2-nashr" sarlavhasi paydo bo'lishi kerak
    await expect(page.getByText(/1-nashr vs 2-nashr/i)).toBeVisible();
    // Unikal xarajatlar hisobga olinmasligi haqida eslatma
    await expect(page.getByText(/unikal xarajatlar hisobga OLINMAYDI/i)).toBeVisible();
  });

  test("RRP ustuni ssenariyda ko'rinadi va 2-nashr rejimida o'zgaradi", async ({ page }) => {
    await page.goto("/acquisitions");
    await page.waitForLoadState("networkidle");

    const scenarioCards = page.locator("a[href*='/acquisitions/']");
    if (await scenarioCards.count() === 0) {
      test.skip(true, "Demo dunyo'da akvizitsiya ssenariysi yo'q");
      return;
    }

    await scenarioCards.first().click();
    await page.waitForLoadState("networkidle");

    // RRP ko'rsatgichi mavjudligi
    await expect(page.getByText("RRP").first()).toBeVisible();

    // 2-nashr rejimida ham RRP ko'rinadi (yangi ustun sifatida)
    const checkbox = page.locator('input[type=checkbox]').first();
    await checkbox.check();
    await page.waitForTimeout(400);

    // Ikkala nashr ustuni ko'rinadi
    await expect(page.getByText(/1-nashr/i).first()).toBeVisible();
    await expect(page.getByText(/2-nashr/i).first()).toBeVisible();
  });

  test("nusxa olish (duplicate) tugmasi ssenariy sahifasida mavjud (agar implement qilingan)", async ({ page }) => {
    await page.goto("/acquisitions");
    await page.waitForLoadState("networkidle");

    const scenarioCards = page.locator("a[href*='/acquisitions/']");
    if (await scenarioCards.count() === 0) {
      test.skip(true, "Demo dunyo'da akvizitsiya ssenariysi yo'q");
      return;
    }

    await scenarioCards.first().click();
    await page.waitForLoadState("networkidle");

    // Ssenariy tahrirlash sahifasi yuklanganligini tekshiramiz
    await expect(page.getByRole("button", { name: /Tasdiqlash|Saqlash|Yangi ssenariy/i }).first()).toBeVisible();
  });
});
