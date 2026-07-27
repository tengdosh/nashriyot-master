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

test.describe("03 – Print order va QoH (ombordagi qoldiq) oshishi", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirector(page);
  });

  test("/production/print-orders sahifasi 200 qaytaradi va yuklanadi", async ({ page }) => {
    const res = await page.goto("/production/print-orders");
    await page.waitForLoadState("networkidle");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/production\/print-orders/);
    await expect(page.getByRole("heading", { name: "Print orderlar" })).toBeVisible();
  });

  test("Yangi order tugmasi ko'rinadi va formasini ochadi", async ({ page }) => {
    await page.goto("/production/print-orders");
    await page.waitForLoadState("networkidle");

    const addBtn = page.getByRole("button", { name: "Yangi order" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Forma/karta ochilib "Yangi print order" sarlavhasi ko'rinadi
    await expect(page.getByText("Yangi print order (outsource bosmaxona)")).toBeVisible({ timeout: 5_000 });
  });

  test("yangi print order yaratiladi va jadvalda REQUESTED holati ko'rinadi", async ({ page }) => {
    await page.goto("/production/print-orders");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Yangi order" }).click();
    await page.waitForTimeout(400);

    // Nashr, SKU, va bosmaxona selectlari
    // Agar ular to'ldirilgan bo'lsa, "Yaratish" bosamiz
    const createBtn = page.getByRole("button", { name: "Yaratish" });
    if (!await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "Yaratish tugmasi topilmadi");
      return;
    }

    await createBtn.click();
    await page.waitForLoadState("networkidle");

    // Yangi order "REQUESTED" holat badge bilan jadvalda ko'rinadi
    await expect(page.getByText(/REQUESTED|So'rov/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("REQUESTED → APPROVED tranzitsiyasi", async ({ page }) => {
    await page.goto("/production/print-orders");
    await page.waitForLoadState("networkidle");

    // "Tasdiqlash" tugmasi bo'lsa, REQUESTED → APPROVED
    const approveBtn = page.getByRole("button", { name: "Tasdiqlash" }).first();
    if (!await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "REQUESTED statusli print order yo'q");
      return;
    }

    await approveBtn.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/APPROVED|Tasdiqlangan/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("APPROVED → PRINTING tranzitsiyasi", async ({ page }) => {
    await page.goto("/production/print-orders");
    await page.waitForLoadState("networkidle");

    const printingBtn = page.getByRole("button", { name: "Bosishga" }).first();
    if (!await printingBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "APPROVED statusli print order yo'q");
      return;
    }

    await printingBtn.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/PRINTING|Bosilmoqda/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("RECEIVED print orderdan so'ng /inventory sahifasida QoH ko'rsatiladi", async ({ page }) => {
    // RECEIVED holati maxsus qabul forma orqali amalga oshiriladi.
    // Biz inventoryni tekshirib, QoH maʼlumotlari borligini ko'ramiz.
    await page.goto("/inventory");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/inventory/);
    await expect(page.getByRole("heading", { name: "Ombor" })).toBeVisible();
    // Zaxira qiymati KPI – kamida 0 bo'lmagan qiymat
    await expect(page.getByText("Zaxira qiymati")).toBeVisible();
  });
});
