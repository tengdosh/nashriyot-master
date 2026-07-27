import { test, expect, type Page } from "@playwright/test";

const DIRECTOR_EMAIL = "director@nashriyot.uz";
const DIRECTOR_PASS = "Parol123!";
// editor@nashriyot.uz: ACQUISITION_EDITOR roli, faqat ent-tasnim entitysiga kirish
const EDITOR_EMAIL = "editor@nashriyot.uz";
const EDITOR_PASS = "Parol123!";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ]);
}

test.describe("06 – Portal izolyatsiyasi va RBAC chegaralari", () => {
  test("editor sifatida login muvaffaqiyatli bo'ladi va dashboard ko'rinadi", async ({ page }) => {
    await loginAs(page, EDITOR_EMAIL, EDITOR_PASS);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Boshqaruv paneli/i })).toBeVisible();
  });

  test("editor /titles sahifasida faqat o'z subʼekti (TASNIM) sarlavhalarini ko'radi", async ({ page }) => {
    await loginAs(page, EDITOR_EMAIL, EDITOR_PASS);
    await page.goto("/titles");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/titles/);
    await expect(page.getByRole("heading", { name: "Sarlavhalar" })).toBeVisible();

    // Editor faqat ent-tasnim sarlavhalarini ko'radi
    // TAHLIL subʼekti ko'rinmasligi kerak
    const tahlilCells = await page.getByText("TAHLIL").count();
    expect(tahlilCells).toBe(0);
  });

  test("editor /admin ga kirishga uringanda yo'naltiriladi (/admin da qolmaydi)", async ({ page }) => {
    await loginAs(page, EDITOR_EMAIL, EDITOR_PASS);

    // /admin ga urinish — middleware admin.users yo'qligi uchun / ga yo'naltiradi
    // app/page.tsx: redirect("/dashboard")
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const finalUrl = page.url();
    // /admin sahifasida qolmasligi kerak
    expect(finalUrl).not.toContain("/admin");
  });

  test("director /admin ga kiradi (admin.users ruxsati bor)", async ({ page }) => {
    await loginAs(page, DIRECTOR_EMAIL, DIRECTOR_PASS);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("heading", { name: /Admin|Administratsiya/i })).toBeVisible();
  });

  test("editor sidebarida /admin havolasi ko'rinmaydi", async ({ page }) => {
    await loginAs(page, EDITOR_EMAIL, EDITOR_PASS);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Sidebar navigatsiyasida "Administratsiya" havolasi ko'rinmasligi kerak
    const adminLink = page.getByRole("link", { name: "Administratsiya" });
    await expect(adminLink).not.toBeVisible({ timeout: 3_000 });
  });

  test("director sidebarida barcha navigatsiya elementlari ko'rinadi", async ({ page }) => {
    await loginAs(page, DIRECTOR_EMAIL, DIRECTOR_PASS);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Director barcha modullarga kirish huquqiga ega
    await expect(page.getByRole("link", { name: "Sarlavhalar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administratsiya" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Royalti" })).toBeVisible();
  });

  test("author foydalanuvchisi /titles ga kirish huquqiga ega emas", async ({ page }) => {
    // author@nashriyot.uz: AUTHOR roli, faqat portal.read
    await page.goto("/login");
    await page.fill('[name=email]', "author@nashriyot.uz");
    await page.fill('[name=password]', DIRECTOR_PASS);
    await page.click('button[type=submit]');

    // AUTHOR foydalanuvchisi /dashboard ga yo'naltiriladi lekin dashboard.read yo'q
    // Shuning uchun middleware /ga yo'naltirishi mumkin
    await page.waitForTimeout(5_000);
    const urlAfterLogin = page.url();

    // Har qanday holat — /titles ga kirish
    await page.goto("/titles");
    await page.waitForLoadState("networkidle");

    // /titles ga kirishga ruxsat yo'q — / yoki /login ga yo'naltirilishi kerak
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("/titles");
    void urlAfterLogin; // lint uchun
  });
});
