import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers.js";

test.describe("standard error UX E2E", () => {
  test("shows backend 403 with request id when a hidden route is opened directly", async ({ page }) => {
    await loginAs(page, "logistics");

    await page.goto("/audit-logs");

    await expect(page.getByRole("alert")).toContainText("无权限执行该操作。");
    await expect(page.getByRole("alert")).toContainText(/req[-_]/);
  });

  test("shows backend 422 with request id for a command validation error", async ({ page }) => {
    await loginAs(page, "sales");
    await page.route("**/api/v1/inventory-batches", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "validation_error",
              message: "请检查表单字段。",
              details: [{ path: ["initial_qty"], message: "数量不合法" }],
              request_id: "req_e2e_validation"
            }
          })
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("link", { name: "库存" }).click();
    await page.getByRole("button", { name: "新增入库" }).click();
    await page.getByLabel("品系 ID").fill("1");
    await page.getByLabel("出生日期").fill("2026-05-29");
    await page.getByLabel("原始数量").fill("3");
    await page.getByLabel("入库日期").fill("2026-06-26");
    await page.getByRole("button", { name: "保存入库" }).click();

    await expect(page.getByRole("alert")).toContainText("请检查表单字段。");
    await expect(page.getByRole("alert")).toContainText("req_e2e_validation");
  });
});
