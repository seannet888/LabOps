import { expect, test } from "@playwright/test";
import { apiLogin, firstTableRow, loginAs } from "./helpers.js";

test.describe("role visibility E2E", () => {
  test("sales sees order actions but not audit navigation", async ({ page }) => {
    await loginAs(page, "sales");

    await expect(page.getByRole("link", { name: "审计" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "创建订单" })).toBeVisible();
    await expect(firstTableRow(page).getByRole("button", { name: "确认" })).toBeVisible();
  });

  test("logistics can operate delivery but cannot mutate orders or customers", async ({ page }) => {
    const salesToken = await apiLogin(page, "sales");
    await page.request.post("/api/v1/orders/1/confirm", {
      headers: {
        Authorization: `Bearer ${salesToken}`,
        "Idempotency-Key": `e2e-role-confirm-${Date.now()}`
      },
      data: {}
    });

    await loginAs(page, "logistics");

    await page.getByRole("link", { name: "订单" }).click();
    await expect(page.getByRole("link", { name: "创建订单" })).toHaveCount(0);
    await expect(firstTableRow(page).getByRole("button", { name: "确认" })).toHaveCount(0);

    await page.getByRole("link", { name: "客户" }).click();
    await expect(page.getByRole("button", { name: "新增客户" })).toHaveCount(0);

    await page.getByRole("link", { name: "配送" }).click();
    await expect(firstTableRow(page).getByRole("button", { name: "安排" })).toBeVisible();
  });

  test("manager can access audit logs", async ({ page }) => {
    await loginAs(page, "manager");

    await page.getByRole("link", { name: "审计" }).click();
    await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();
  });
});
