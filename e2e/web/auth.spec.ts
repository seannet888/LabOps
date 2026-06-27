import { expect, test } from "@playwright/test";

test.describe("auth E2E", () => {
  test("shows a standard login error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("用户名").fill("sales01");
    await page.getByLabel("密码").fill("wrong-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByRole("alert")).toContainText("登录");
  });

  test("logs in as sales and lands in the protected shell", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("用户名").fill("sales01");
    await page.getByLabel("密码").fill("sales-dev-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByRole("heading", { name: "订单" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("link", { name: "审计" })).toHaveCount(0);
  });
});
