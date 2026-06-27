import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../app/render-app.js";

function me(role: "sales" | "logistics" | "manager") {
  return new Response(JSON.stringify({
    data: {
      id: `usr_${role}`,
      username: role,
      display_name: role,
      role,
      permissions: []
    }
  }), { status: 200 });
}

function deliveryTasksResponse(status = "scheduled") {
  return new Response(JSON.stringify({
    data: [{
      id: "dt_001",
      order_id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      status,
      customer_name: "Peking Lab",
      geo_area: "海淀",
      delivery_address: "北京市海淀区xxx楼xxx室",
      contact_name: "李同学",
      contact_phone: "13800000000",
      planned_delivery_date: "2026-06-27",
      sales_action_required: false,
      document_readiness: {
        certificate_uploaded: false,
        invoice_registered: false,
        requires_invoice: true
      }
    }],
    meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    links: { self: "/api/v1/delivery-tasks?page=1" }
  }), { status: 200 });
}

function suggestionsResponse() {
  return new Response(JSON.stringify({
    data: [{
      order_item_id: "item_1",
      required_qty: 10,
      suggested_batches: [{ inventory_batch_id: "batch_1", quantity: 10, reason: "优先老化/先进先出" }]
    }]
  }), { status: 200 });
}

function deliveryTaskDetailResponse() {
  return new Response(JSON.stringify({
    data: {
      id: "dt_001",
      order_id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      status: "scheduled",
      customer_name: "Peking Lab",
      geo_area: "海淀",
      delivery_address: "北京市海淀区xxx楼xxx室",
      contact_name: "李同学",
      contact_phone: "13800000000",
      planned_delivery_date: "2026-06-27",
      vehicle: "京A12345",
      driver: "张师傅",
      delivery_batch: "BATCH-01",
      route_notes: "上午送达",
      sales_action_required: false,
      document_readiness: {
        certificate_uploaded: false,
        invoice_registered: false,
        requires_invoice: true
      }
    }
  }), { status: 200 });
}

describe("delivery pages", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders delivery task rows and keeps filters in the API query", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValue(deliveryTasksResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/delivery-tasks"] }));

    expect(await screen.findByRole("heading", { name: "配送任务" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "XS20260626a3f8b2c1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Peking Lab" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("状态筛选"), "pending_schedule");
    await user.type(screen.getByLabelText("计划配送日期"), "2026-06-27");
    await user.type(screen.getByLabelText("区域筛选"), "海淀");
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() => {
      const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("per_page=20");
      expect(lastUrl).toContain("status=pending_schedule");
      expect(lastUrl).toContain("planned_delivery_date=2026-06-27");
      expect(lastUrl).toContain("geo_area=%E6%B5%B7%E6%B7%80");
    });
  });

  it("keeps sales users read-only for shipment and delivery actions", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(deliveryTasksResponse()));

    render(renderApp({ initialEntries: ["/delivery-tasks"] }));

    expect(await screen.findByRole("heading", { name: "配送任务" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "安排" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "出库" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "送达" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "标记问题" })).not.toBeInTheDocument();
  });

  it("confirms shipment with user-confirmed stock deductions rather than raw suggestions", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(deliveryTasksResponse("scheduled"))
      .mockResolvedValueOnce(suggestionsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "dt_001", status: "shipped", order_id: "ord_001", order_status: "shipped" }
      }), { status: 200 }))
      .mockResolvedValueOnce(deliveryTasksResponse("shipped"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/delivery-tasks"] }));

    await user.click(await screen.findByRole("button", { name: "出库" }));
    expect(await screen.findByText("建议批次 batch_1，建议数量 10，原因：优先老化/先进先出")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("扣减数量"));
    await user.type(screen.getByLabelText("扣减数量"), "8");
    await user.click(screen.getByLabelText("缺少合格证"));
    await user.type(screen.getByLabelText("放行原因"), "纸质随货");
    await user.click(screen.getByRole("button", { name: "提交出库" }));

    expect(await screen.findByText("出库已确认")).toBeInTheDocument();
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/v1/delivery-tasks/dt_001/confirm-shipment");
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      stock_deductions: [{ order_item_id: "item_1", inventory_batch_id: "batch_1", quantity: 8 }],
      document_release: { missing_certificate: true, missing_invoice: false, reason: "纸质随货" }
    });
  });

  it("shows standard API errors with request id for delivery commands", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(deliveryTasksResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "validation_error", message: "Invalid input", request_id: "req_422" }
      }), { status: 422 })));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/delivery-tasks"] }));

    await user.click(await screen.findByRole("button", { name: "安排" }));
    await user.click(screen.getByRole("button", { name: "提交安排" }));

    expect(await screen.findByText("请检查表单字段。")).toBeInTheDocument();
    expect(screen.getByText("request_id: req_422")).toBeInTheDocument();
  });

  it("blocks invalid delivery command forms before calling the API", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(deliveryTasksResponse("scheduled"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/delivery-tasks"] }));

    await user.click(await screen.findByRole("button", { name: "出库" }));
    await user.clear(await screen.findByLabelText("扣减数量"));
    await user.type(screen.getByLabelText("扣减数量"), "0");
    await user.click(screen.getByLabelText("缺少合格证"));
    await user.click(screen.getByRole("button", { name: "提交出库" }));

    expect(await screen.findByText("扣减数量必须是正整数")).toBeInTheDocument();
    expect(screen.getByText("票证缺失时放行原因必填")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("renders delivery detail fields from the API", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(deliveryTaskDetailResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(renderApp({ initialEntries: ["/delivery-tasks/dt_001"] }));

    expect(await screen.findByRole("heading", { name: "配送详情" })).toBeInTheDocument();
    expect(await screen.findByText("XS20260626a3f8b2c1")).toBeInTheDocument();
    expect(screen.getByText("Peking Lab")).toBeInTheDocument();
    expect(screen.getByText("scheduled")).toBeInTheDocument();
    expect(screen.getByText("2026-06-27")).toBeInTheDocument();
    expect(screen.getByText("京A12345")).toBeInTheDocument();
    expect(screen.getByText("张师傅")).toBeInTheDocument();
    expect(screen.getByText("北京市海淀区xxx楼xxx室")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/delivery-tasks/dt_001");
    expect(screen.getByRole("link", { name: "返回配送列表" })).toBeInTheDocument();
  });
});
