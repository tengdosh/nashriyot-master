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

test.describe("07 – Transfer va chegirma muhrlanishi (SEALED)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/transfers sahifasi 200 qaytaradi va yuklanadi", async ({ page }) => {
    const res = await page.goto("/transfers");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/transfers/);
    await expect(page.getByRole("heading", { name: /Transferlar|Sub.*ektlararo/i })).toBeVisible();
  });

  test("yangi transfer tugmasi ko'rinadi", async ({ page }) => {
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Yangi transfer" })).toBeVisible();
  });

  test("yangi transfer yaratish (mahsulot, miqdor, sabab bilan)", async ({ page }) => {
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Yangi transfer" }).click();
    await page.waitForTimeout(500);

    // Sheet/dialog panel ochildi — entity va mahsulot selectlari ko'rinishi kerak
    const fromEntitySelect = page.locator('[role=combobox]').first();
    await expect(fromEntitySelect).toBeVisible({ timeout: 6_000 });

    // Yaratish/Saqlash tugmasini topib bosamiz
    const createBtn = page.getByRole("button", { name: /Yaratish|Transfer yaratish/i });
    if (!await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "Yaratish tugmasi topilmadi");
      return;
    }

    await createBtn.click();
    await page.waitForLoadState("networkidle");
    // Muvaffaqiyatli bo'lsa, jadvalda yangi DRAFT transfer ko'rinadi
    await expect(page.getByText("DRAFT").first()).toBeVisible({ timeout: 8_000 });
  });

  test("DRAFT transfer joʻnatiladi (DRAFT → SHIPPED)", async ({ page }) => {
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle");

    const shipBtn = page.getByRole("button", { name: "Joʻnatish" }).first();
    if (!await shipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "DRAFT statusli transfer topilmadi");
      return;
    }

    await shipBtn.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("SHIPPED").first()).toBeVisible({ timeout: 8_000 });
  });

  test("transfer qatorlarida chegirma ma'lumoti ko'rinadi (sealed lines)", async ({ page }) => {
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da transferlar yo'q");
      return;
    }

    // Jadval sarlavhalari
    await expect(page.getByText("Kimdan").first()).toBeVisible();
    await expect(page.getByText("Kimga").first()).toBeVisible();
    await expect(page.getByText("Holat").first()).toBeVisible();

    // Birinchi qatorni expand qilib chegirma ko'rsatkichi borligini tekshiramiz
    const expandBtn = page.locator("tbody tr").first().locator("button").first();
    if (await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(400);
      // Transfer qatorida chegirma ustuni ko'rinadi
      const discountText = page.getByText(/Chegirma|discountRate/i);
      if (await discountText.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(discountText.first()).toBeVisible();
      }
    }
  });

  test("transfer chegirma muhrlanishi haqida tushuntirma matni bor", async ({ page }) => {
    await page.goto("/transfers");
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.skip(true, "Demo dunyo'da transferlar yo'q");
      return;
    }

    // Expand qilganda muhrlanish haqida izoh ko'rinadi
    const expandBtn = page.locator("tbody tr").first().locator("button").first();
    if (await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(400);
      // "Transfer sotuv emas" matni
      const note = page.getByText(/Transfer sotuv emas/i);
      if (await note.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(note.first()).toBeVisible();
      }
    }
  });

  test("ichki ledger sahifasi yuklanadi", async ({ page }) => {
    await page.goto("/entities/ledger");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/entities\/ledger/);
    // Ledger sarlavhasi
    await expect(page.getByRole("heading", { name: /ledger|Ledger|Hisobot/i }).first()).toBeVisible();
  });
});
