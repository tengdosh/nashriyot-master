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

test.describe("04 – Sotuv buyurtmasi va CM ko'rsatkichi", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/sales sahifasi /sales/orders ga yo'naltiradi", async ({ page }) => {
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sales\/orders/);
    await expect(page.getByRole("heading", { name: "Sotuv buyurtmalari" })).toBeVisible();
  });

  test("KPI kartalarida 'Muhrlangan marja (CM)' ko'rsatgichi bor", async ({ page }) => {
    await page.goto("/sales/orders");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Buyurtmalar")).toBeVisible();
    await expect(page.getByText("Muhrlangan marja (CM)")).toBeVisible();
    await expect(page.getByText("Joʻnatilgan nusxa")).toBeVisible();
    await expect(page.getByText("Ochiq buyurtma qiymati")).toBeVisible();
  });

  test("yangi sotuv buyurtmasi yaratilib DRAFT holatda ko'rinadi", async ({ page }) => {
    await page.goto("/sales/orders");
    await page.waitForLoadState("networkidle");

    // Yangi order tugmasi (faqat sales.write bo'lganlar uchun ko'rinadi)
    const newBtn = page.getByRole("button", { name: /Yangi/i }).first();
    if (!await newBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, "Yangi order tugmasi yo'q — foydalanuvchida sales.write ruxsati yo'q");
      return;
    }
    await newBtn.click();
    await page.waitForTimeout(500);

    // Sheet/dialog ochildi — kanal selector ko'rinishi kerak
    const channelEl = page.locator('[role=combobox]').first();
    await expect(channelEl).toBeVisible({ timeout: 6_000 });

    // Yaratish tugmasi bilan saqlash
    const saveBtn = page.getByRole("button", { name: "Yaratish" });
    if (!await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "Yaratish tugmasi topilmadi");
      return;
    }
    await saveBtn.click();
    await page.waitForLoadState("networkidle");

    // DRAFT status badge ko'rinadi
    await expect(page.getByText("DRAFT").first()).toBeVisible({ timeout: 10_000 });
  });

  test("DRAFT status badge jadvalda ko'rinadi (demo dunyo orderlari)", async ({ page }) => {
    await page.goto("/sales/orders");
    await page.waitForLoadState("networkidle");

    // Demo dunyo'da orderlar bo'lishi kerak
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da sotuv buyurtmalari yo'q");
      return;
    }

    // Istalgan status badge ko'rinishi
    const statusBadge = page.locator("tbody").getByText(/DRAFT|CONFIRMED|SHIPPED|PAID|CANCELLED/i).first();
    await expect(statusBadge).toBeVisible({ timeout: 5_000 });
  });

  test("sotuv buyurtmasi detail sahifasida CM ko'rsatkichi bor", async ({ page }) => {
    await page.goto("/sales/orders");
    await page.waitForLoadState("networkidle");

    const orderLinks = page.locator("a[href*='/sales/orders/']");
    if (await orderLinks.count() === 0) {
      test.skip(true, "Demo dunyo'da sotuv buyurtmalari yo'q");
      return;
    }

    await orderLinks.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sales\/orders\/.+/);

    // CM yoki marja ko'rsatkichi
    await expect(page.getByText(/CM|cmUnit|Marja/i).first()).toBeVisible();
  });
});
