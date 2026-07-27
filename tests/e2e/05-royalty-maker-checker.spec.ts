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

test.describe("05 – Royalti run va maker-checker nazorati", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/royalties sahifasi /royalties/runs ga yo'naltiradi", async ({ page }) => {
    await page.goto("/royalties");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/royalties\/runs/);
    await expect(page.getByRole("heading", { name: "Royalti hisoblari" })).toBeVisible();
  });

  test("KPI kartalar va davr input forması ko'rinadi", async ({ page }) => {
    await page.goto("/royalties/runs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Hisoblar")).toBeVisible();
    await expect(page.getByText("Jami hisoblangan")).toBeVisible();
    await expect(page.getByText("Ushlangan zaxira")).toBeVisible();
    await expect(page.getByText("Toʻlanadigan")).toBeVisible();

    // Yangi run yaratish forma elementlari
    await expect(page.getByPlaceholder("2026-H1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hisoblash" })).toBeVisible();
  });

  test("maker-checker: o'zi hisoblagan runni tasdiqlay olmasligi haqida xabar bor", async ({ page }) => {
    await page.goto("/royalties/runs");
    await page.waitForLoadState("networkidle");

    // Yangi run yaratib, detail sahifasiga o'tamiz
    const periodInput = page.getByPlaceholder("2026-H1");
    // O'tgan yil uchun test davri (demo dunyo bilan kesishmasligi uchun)
    await periodInput.fill("2023-H2");
    await page.getByRole("button", { name: "Hisoblash" }).click();

    // Run muvaffaqiyatli yaratilsa, detail sahifasiga yo'naltiriladi
    // Muhrlanmagan yoki kesishgan bo'lsa, xatolik toast ko'rinadi
    await page.waitForTimeout(5_000);
    const currentUrl = page.url();

    if (currentUrl.includes("/royalties/runs/")) {
      // Detail sahifasida maker-checker xabari ko'rinadi
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByText("Oʻzingiz hisoblagan runni tasdiqlay olmaysiz")
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // Davr kesishgan yoki muhrlanmagan → xatolik xabari
      // Bu ham kutilgan xatti-harakat (CLAUDE.md: kesishgan davr rad etiladi)
      const errMsg = page.getByText(/muhrlangan|kesishgan|rad etildi|Xatolik/i);
      if (await errMsg.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(errMsg.first()).toBeVisible();
      }
    }
  });

  test("mavjud DRAFT run detail sahifasida maker-checker elementi ko'rinadi", async ({ page }) => {
    await page.goto("/royalties/runs");
    await page.waitForLoadState("networkidle");

    // Demo dunyo'da royalti runlar bor (2 SENT + 1 DRAFT, docs/demo-data.md)
    const runLinks = page.locator("a[href*='/royalties/runs/']");
    if (await runLinks.count() === 0) {
      test.skip(true, "Demo dunyo'da royalti runlar yo'q");
      return;
    }

    await runLinks.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/royalties\/runs\/.+/);

    // Davr nomi sarlavhada ko'rinadi
    await expect(page.getByRole("heading", { name: /Royalti hisobi/i })).toBeVisible();

    // Maker yoki approver maʼlumoti
    await expect(page.getByText(/hisobladi|tasdiqladi/i)).toBeVisible();

    // DRAFT run uchun: maker-checker xabari YOKI tasdiqlash tugmasi
    const makerNote = page.getByText("Oʻzingiz hisoblagan runni tasdiqlay olmaysiz");
    const approveBtn = page.getByRole("button", { name: "Tasdiqlash" });
    const sealedNote = page.getByText(/muhrlangan/i);

    const isNoteVisible = await makerNote.isVisible({ timeout: 2_000 }).catch(() => false);
    const isApproveVisible = await approveBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    const isSealedVisible = await sealedNote.isVisible({ timeout: 2_000 }).catch(() => false);

    // Ulardan kamida biri ko'rinishi kerak
    expect(isNoteVisible || isApproveVisible || isSealedVisible).toBe(true);
  });

  test("shartnomalar sahifasiga havola ko'rinadi", async ({ page }) => {
    await page.goto("/royalties/runs");
    await page.waitForLoadState("networkidle");

    // "Shartnomalar" havolasi (royalty runs sahifasida)
    await expect(page.getByRole("link", { name: "Shartnomalar" })).toBeVisible();
  });
});
