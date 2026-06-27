import { expect, test } from "@playwright/test";
import { loginAs, logout } from "./helpers.js";

test.describe("sales to delivery core flow E2E", () => {
  test("runs customer, inventory, order, delivery, settlement, and audit smoke", async ({ page }) => {
    await loginAs(page, "sales");

    await page.getByRole("link", { name: "客户" }).click();
    await page.getByRole("button", { name: "新增客户" }).click();
    await page.getByLabel("客户名称").fill(`E2E Lab ${Date.now()}`);
    await page.getByLabel("单位").fill("E2E University");
    await page.getByLabel("区域", { exact: true }).fill("北京");
    await page.getByRole("button", { name: "保存客户" }).click();
    await expect(page.getByText("客户已创建")).toBeVisible();

    await page.getByRole("link", { name: "库存" }).click();
    await page.getByRole("button", { name: "新增入库" }).click();
    await page.getByLabel("品系 ID").fill("1");
    await page.getByLabel("出生日期").fill("2026-05-29");
    await page.getByLabel("原始数量").fill("20");
    await page.getByLabel("入库日期").fill("2026-06-26");
    await page.getByLabel("备注").fill("E2E inbound batch");
    await page.getByRole("button", { name: "保存入库" }).click();
    await expect(page.getByText("入库已创建")).toBeVisible();

    await page.getByRole("link", { name: "订单", exact: true }).click();
    await page.getByRole("link", { name: "创建订单" }).click();
    await page.getByLabel("客户 ID").fill("1");
    await page.getByLabel("配送方式").fill("135");
    await page.getByLabel("计划送达日期").fill("2026-06-30");
    await page.getByLabel("品系 ID").fill("1");
    await page.getByLabel("周龄").fill("4");
    await page.getByLabel("数量").fill("2");
    await page.getByLabel("实际单价").fill("28.00");
    const createOrderResponse = page.waitForResponse((response) =>
      response.url().includes("/api/v1/orders") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "保存订单" }).click();
    const createdOrder = (await (await createOrderResponse).json()) as { data: { id: string; order_number: string } };
    await expect(page.getByText("订单已创建")).toBeVisible();

    const orderNumber = createdOrder.data.order_number;
    const orderId = createdOrder.data.id;
    const orderRow = page.locator("tbody tr", { hasText: orderNumber }).first();
    await expect(orderRow).toBeVisible();

    await orderRow.getByRole("button", { name: "确认" }).click();
    await page.getByLabel("确认备注").fill("E2E 客户确认");
    await page.getByRole("button", { name: "提交确认" }).click();
    await expect(page.getByText("订单已确认")).toBeVisible();

    await logout(page);
    await loginAs(page, "logistics");
    await page.getByRole("link", { name: "配送" }).click();

    const deliveryRow = page.locator("tbody tr", { hasText: orderNumber }).first();
    await deliveryRow.getByRole("button", { name: "安排" }).click();
    await page.getByLabel("计划配送日期", { exact: true }).fill("2026-06-30");
    await page.getByLabel("车辆").fill("京A-E2E");
    await page.getByLabel("司机").fill("E2E Driver");
    await page.getByLabel("配送批次").fill("E2E-BATCH");
    await page.getByRole("button", { name: "提交安排" }).click();
    await expect(page.getByText("配送已安排")).toBeVisible();

    await page.locator("tbody tr", { hasText: orderNumber }).first().getByRole("button", { name: "出库" }).click();
    await expect(page.getByText("建议只是起点，提交前请确认实际扣减批次和数量。")).toBeVisible();
    await expect(page.getByLabel("订单项 ID")).not.toHaveValue("");
    await expect(page.getByLabel("库存批次 ID")).not.toHaveValue("");
    await page.getByLabel("扣减数量").fill("2");

    const shipmentRequest = page.waitForRequest((request) => request.url().includes("/confirm-shipment") && request.method() === "POST");
    await page.getByRole("button", { name: "提交出库" }).click();
    const shipmentPayload = JSON.parse((await shipmentRequest).postData() ?? "{}") as {
      stock_deductions?: Array<{ order_item_id: string; inventory_batch_id: string; quantity: number }>;
    };
    expect(shipmentPayload.stock_deductions).toEqual([
      expect.objectContaining({ quantity: 2 })
    ]);
    await expect(page.getByText("出库已确认")).toBeVisible();

    await page.locator("tbody tr", { hasText: orderNumber }).first().getByRole("button", { name: "送达" }).click();
    await page.getByLabel("送达时间").fill("2026-06-30");
    await page.getByLabel("送达备注").fill("E2E delivered");
    await page.getByRole("button", { name: "提交送达" }).click();
    await expect(page.getByText("送达已确认")).toBeVisible();

    await logout(page);
    await loginAs(page, "sales");
    const token = await page.evaluate(() => localStorage.getItem("labops_access_token"));
    expect(token).toBeTruthy();
    const archiveResponse = await page.request.post(`http://127.0.0.1:3000/api/v1/orders/${orderId}/archive-documents`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `e2e-archive-${Date.now()}`
      },
      data: { note: "E2E archive prerequisite for settlement UI" }
    });
    expect(archiveResponse.ok(), await archiveResponse.text()).toBe(true);

    await page.getByRole("link", { name: "订单", exact: true }).click();
    await page.locator("tbody tr", { hasText: orderNumber }).first().getByRole("button", { name: "结算" }).click();
    await page.getByLabel("结算日期").fill("2026-07-01");
    await page.getByLabel("支付方式").fill("bank_transfer");
    await page.getByLabel("结算备注").fill("E2E settlement");
    await page.getByRole("button", { name: "提交结算" }).click();
    await expect(page.getByText("订单已结算")).toBeVisible();

    await logout(page);
    await loginAs(page, "manager");
    await page.getByRole("link", { name: "审计" }).click();
    await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();
    await expect(page.getByText("确认订单").first()).toBeVisible();
  });
});
