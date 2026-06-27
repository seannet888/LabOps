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

function ordersResponse(status = "confirmed") {
  return new Response(JSON.stringify({
    data: [{
      id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      customer_id: "cus_001",
      customer_name: "Peking Lab",
      status,
      total_amount: "560.00",
      requires_invoice: true,
      invoice_type: "tech_service",
      created_at: "2026-06-25T10:30:00.000Z"
    }],
    meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    links: { self: "/api/v1/orders?page=1" }
  }), { status: 200 });
}

describe("orders pages", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders order list rows and keeps filters in the API query", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValue(ordersResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    expect(await screen.findByRole("heading", { name: "订单" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "XS20260626a3f8b2c1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Peking Lab" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "560.00 CNY" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("客户筛选"), "cus_001");
    await user.selectOptions(screen.getByLabelText("状态筛选"), "confirmed");
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() => {
      const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("per_page=20");
      expect(lastUrl).toContain("customer_id=cus_001");
      expect(lastUrl).toContain("status=confirmed");
    });
  });

  it("keeps logistics users read-only on order rows", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(ordersResponse()));

    render(renderApp({ initialEntries: ["/orders"] }));

    expect(await screen.findByRole("heading", { name: "订单" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "创建订单" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "改价" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "结算" })).not.toBeInTheDocument();
  });

  it("does not offer confirm on orders that are already confirmed", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("confirmed")));

    render(renderApp({ initialEntries: ["/orders"] }));

    expect(await screen.findByRole("cell", { name: "confirmed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("creates an order with an Idempotency-Key and returns to the list", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "ord_new", order_number: "XS20260626abcd1234", status: "pending", total_amount: "560.00" }
      }), { status: 201 }))
      .mockResolvedValueOnce(ordersResponse("pending"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders/new"] }));

    expect(await screen.findByRole("heading", { name: "创建订单" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("客户 ID"), "cus_001");
    await user.type(screen.getByLabelText("计划送达日期"), "2026-06-27");
    await user.click(screen.getByLabelText("需要发票"));
    await user.type(screen.getByLabelText("发票类型"), "tech_service");
    await user.type(screen.getByLabelText("品系 ID"), "str_001");
    await user.type(screen.getByLabelText("周龄"), "5");
    await user.selectOptions(screen.getByLabelText("性别"), "M");
    await user.type(screen.getByLabelText("数量"), "20");
    await user.type(screen.getByLabelText("实际单价"), "28.00");
    await user.click(screen.getByRole("button", { name: "保存订单" }));

    expect(await screen.findByText("订单已创建")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "订单" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/orders");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      customer_id: "cus_001",
      planned_delivery_date: "2026-06-27",
      requires_invoice: true,
      invoice_type: "tech_service",
      items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "28.00" }]
    });
  });

  it("confirms a pending order and refreshes the list", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("pending"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "ord_001", status: "confirmed", delivery_task_id: "dt_001" },
        meta: { events: ["order_confirmed"] }
      }), { status: 200 }))
      .mockResolvedValueOnce(ordersResponse("confirmed"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "确认" }));
    await user.type(screen.getByLabelText("确认备注"), "客户微信确认");
    await user.click(screen.getByRole("button", { name: "提交确认" }));

    expect(await screen.findByText("订单已确认")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/orders/ord_001/confirm");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ confirm_note: "客户微信确认" });
  });

  it("changes order prices with a reason and item price payload", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("pending"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "ord_001" } }), { status: 200 }))
      .mockResolvedValueOnce(ordersResponse("pending"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "改价" }));
    await user.type(screen.getByLabelText("改价原因"), "长期协议价");
    await user.type(screen.getByLabelText("订单项 ID"), "item_1");
    await user.type(screen.getByLabelText("新实际单价"), "25.00");
    await user.click(screen.getByRole("button", { name: "提交改价" }));

    expect(await screen.findByText("订单价格已更新")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/orders/ord_001/change-prices");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      reason: "长期协议价",
      items: [{ order_item_id: "item_1", actual_price: "25.00" }]
    });
  });

  it("cancels an order with a reason", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("pending"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "ord_001", status: "cancelled" } }), { status: 200 }))
      .mockResolvedValueOnce(ordersResponse("cancelled"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "取消" }));
    await user.type(screen.getByLabelText("取消原因"), "客户取消实验计划");
    await user.click(screen.getByRole("button", { name: "提交取消" }));

    expect(await screen.findByText("订单已取消")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/orders/ord_001/cancel");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ reason: "客户取消实验计划" });
  });

  it("settles a delivered order with settlement details", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("delivered"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "ord_001", status: "settled" } }), { status: 200 }))
      .mockResolvedValueOnce(ordersResponse("settled"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "结算" }));
    await user.type(screen.getByLabelText("结算日期"), "2026-07-25");
    await user.type(screen.getByLabelText("支付方式"), "bank_transfer");
    await user.type(screen.getByLabelText("结算备注"), "客户已转账");
    await user.click(screen.getByRole("button", { name: "提交结算" }));

    expect(await screen.findByText("订单已结算")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/orders/ord_001/settle");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      settled_at: "2026-07-25",
      payment_method: "bank_transfer",
      note: "客户已转账"
    });
  });

  it("shows standard API errors with request id for order commands", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("pending"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "conflict", message: "State changed", request_id: "req_conflict" }
      }), { status: 409 })));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "确认" }));
    await user.click(screen.getByRole("button", { name: "提交确认" }));

    expect(await screen.findByText("状态已变化，请刷新后确认。")).toBeInTheDocument();
    expect(screen.getByText("request_id: req_conflict")).toBeInTheDocument();
  });

  it("blocks invalid price change commands before calling the API", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(ordersResponse("pending"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/orders"] }));

    await user.click(await screen.findByRole("button", { name: "改价" }));
    await user.type(screen.getByLabelText("订单项 ID"), "item_1");
    await user.type(screen.getByLabelText("新实际单价"), "25.001");
    await user.click(screen.getByRole("button", { name: "提交改价" }));

    expect(await screen.findByText("改价原因必填")).toBeInTheDocument();
    expect(screen.getByText("金额必须是 decimal string")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders order detail fields from the API", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          id: "ord_001",
          order_number: "XS20260626a3f8b2c1",
          customer_id: "cus_001",
          customer_name: "Peking Lab",
          status: "confirmed",
          total_amount: "560.00",
          requires_invoice: true,
          invoice_type: "tech_service",
          created_at: "2026-06-25T10:30:00.000Z"
        }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(renderApp({ initialEntries: ["/orders/ord_001"] }));

    expect(await screen.findByRole("heading", { name: "订单详情" })).toBeInTheDocument();
    expect(await screen.findByText("XS20260626a3f8b2c1")).toBeInTheDocument();
    expect(screen.getByText("Peking Lab")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
    expect(screen.getByText("560.00 CNY")).toBeInTheDocument();
    expect(screen.getByText("tech_service")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回订单列表" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/orders/ord_001");
  });
});
