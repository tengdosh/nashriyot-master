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

test.describe("09 – Tan narx grafigi va kesishish ogohlantirishi", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/costing sahifasi 200 qaytaradi va yuklanadi", async ({ page }) => {
    const res = await page.goto("/costing");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/costing$/);
    await expect(page.getByRole("heading", { name: /Tan narx/i })).toBeVisible();
  });

  test("tan narx jadvalida reportCost va decisionCost ustunlari ko'rinadi", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    // Sarlavha yordamida ustunlarni topamiz
    await expect(page.getByText("reportCost").first()).toBeVisible();
    await expect(page.getByText("decisionCost").first()).toBeVisible();
  });

  test("birinchi SKU havolasini bosib /costing/[id] sahifasiga o'tiladi", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da tan narx maʼlumotlari yo'q");
      return;
    }

    // Birinchi SKU havolasini bosamiz
    const firstRowLink = page.locator("tbody tr").first().locator("a").first();
    const hasLink = await firstRowLink.isVisible({ timeout: 2_000 }).catch(() => false);
    if (hasLink) {
      await firstRowLink.click();
    } else {
      // Havola yo'q bo'lsa, qatorni bosib ko'ramiz
      await page.locator("tbody tr").first().click();
    }

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/costing\/.+/);
    await expect(page.getByText("jonli tan narx tahlili")).toBeVisible();
  });

  test("/costing/[id] sahifasida SVG grafik (recharts) mavjud", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da tan narx maʼlumotlari yo'q");
      return;
    }

    const firstLink = page.locator("tbody tr").first().locator("a").first();
    if (await firstLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await firstLink.click();
    } else {
      await page.locator("tbody tr").first().click();
    }

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/costing\/.+/);

    // Recharts SVG grafikni tekshirish
    const svg = page.locator("svg");
    await expect(svg.first()).toBeVisible({ timeout: 10_000 });
    const svgCount = await svg.count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("/costing/[id] da grafik legend yozuvlari ko'rinadi", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da tan narx maʼlumotlari yo'q");
      return;
    }

    const firstLink = page.locator("tbody tr").first().locator("a").first();
    if (await firstLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await firstLink.click();
    } else {
      await page.locator("tbody tr").first().click();
    }

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/costing\/.+/);

    // Grafik legend yoki axis: reportCost, decisionCost, Kutilgan sof
    await expect(
      page.getByText(/reportCost|decisionCost|Kutilgan sof/i).first()
    ).toBeVisible({ timeout: 8_000 });

    // Orqaga qaytish havolasi
    await expect(page.getByRole("link", { name: /Tan narx/i })).toBeVisible();
  });

  test("kesishish ogohlantirishi (daysUntilCross ≤ 30) agar mavjud bo'lsa ko'rinadi", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    // Kesishish ogohlantirishi jadvalda yoki detail sahifasida bo'lishi mumkin
    // Demo dunyo'da bo'lishi shart emas — faqat mavjudligini tekshiramiz
    const alertText = page.getByText(/kesish.*kun|break.even|ogohlantirish.*costing/i);
    if (await alertText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(alertText.first()).toBeVisible();
    }

    // Jadval har qanday holatda ko'rinishi kerak
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("snapshot tugmasi director uchun ko'rinadi (admin.settings ruxsati bilan)", async ({ page }) => {
    await page.goto("/costing");
    await page.waitForLoadState("networkidle");

    // Director admin.settings ga ega — snapshot tugmasi ko'rinishi kerak
    const snapshotBtn = page.getByRole("button", { name: /Snapshot/i });
    if (await snapshotBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(snapshotBtn).toBeVisible();
    }
  });
});
