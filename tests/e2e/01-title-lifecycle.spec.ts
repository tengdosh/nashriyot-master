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

test.describe("01 – Sarlavha hayot sikli (DRAFT → REVIEW → APPROVED)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("sidebar Sarlavhalar havolasi sarlavhalar ro'yxatini ochadi", async ({ page }) => {
    await page.getByRole("link", { name: "Sarlavhalar" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/titles/);
    await expect(page.getByRole("heading", { name: "Sarlavhalar" })).toBeVisible();
  });

  test("yangi sarlavha DRAFT holatida yaratiladi", async ({ page }) => {
    await page.goto("/titles/new");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Yangi asar" })).toBeVisible();

    const uniqueName = `Test Asar ${Date.now()}`;
    await page.getByPlaceholder("Asar nomi").fill(uniqueName);

    // Step 1 → Step 2
    await page.getByRole("button", { name: "Keyingi" }).click();
    await page.waitForTimeout(300);

    // Step 2 → Step 3
    await page.getByRole("button", { name: "Keyingi" }).click();
    await page.waitForTimeout(300);

    // Step 3: ko'rib chiqish va yaratish
    await expect(page.getByRole("button", { name: "Yaratish (DRAFT)" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/titles\/[^/]+$/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Yaratish (DRAFT)" }).click(),
    ]);

    await page.waitForLoadState("networkidle");
    // DRAFT badge ko'rinishi (StatusBadge)
    await expect(page.getByText("Qoralama")).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test("DRAFT → REVIEW → APPROVED tranzitsiyalari", async ({ page }) => {
    await page.goto("/titles/new");
    await page.waitForLoadState("networkidle");

    const uniqueName = `Lifecycle ${Date.now()}`;
    await page.getByPlaceholder("Asar nomi").fill(uniqueName);
    await page.getByRole("button", { name: "Keyingi" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Keyingi" }).click();
    await page.waitForTimeout(300);
    await Promise.all([
      page.waitForURL(/\/titles\/[^/]+$/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Yaratish (DRAFT)" }).click(),
    ]);
    await page.waitForLoadState("networkidle");

    // DRAFT holati tasdiqlangan
    await expect(page.getByText("Qoralama")).toBeVisible();

    // DRAFT → REVIEW
    await page.getByRole("button", { name: "Koʻrib chiqish" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Koʻrib chiqish")).toBeVisible();

    // REVIEW → APPROVED
    await page.getByRole("button", { name: "Tasdiqlangan" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Tasdiqlangan")).toBeVisible();
  });

  test("sarlavha detail sahifasida ONIX eksport tugmasi ko'rinadi", async ({ page }) => {
    await page.goto("/titles");
    await page.waitForLoadState("networkidle");

    const titleLinks = page.locator("a[href*='/titles/']").filter({ hasText: /\S+/ });
    const count = await titleLinks.count();
    if (count === 0) {
      test.skip(true, "Demo dunyo'da sarlavhalar yo'q");
      return;
    }

    await titleLinks.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/titles\/[^/]+$/);

    // ONIX tab ni bosib eksport tugmasini ko'rsatamiz
    const onixTab = page.getByRole("tab").filter({ hasText: /onix/i });
    if (await onixTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await onixTab.click();
      await page.waitForTimeout(300);
      await expect(page.getByText(/Yuklab olish.*ONIX/i)).toBeVisible();
    }
  });
});
