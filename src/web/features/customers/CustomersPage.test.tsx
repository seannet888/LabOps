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

function customersResponse() {
  return new Response(JSON.stringify({
    data: [{
      id: "cus_001",
      name: "Peking Lab",
      unit_name: "Peking University",
      research_group: "Wang Lab",
      geo_area: "Haidian",
      settlement_type: "monthly",
      credit_days: 60,
      default_delivery_method: "self_vehicle",
      default_invoice_type: "tech_service",
      is_active: true
    }],
    meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    links: { self: "/api/v1/customers?page=1" }
  }), { status: 200 });
}

describe("customers page", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders customer rows and keeps filters in the API query", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValue(customersResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/customers"] }));

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "Peking Lab" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Peking University" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Haidian" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("客户筛选"), "Peking");
    await user.type(screen.getByLabelText("区域筛选"), "Haidian");
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() => {
      const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("per_page=20");
      expect(lastUrl).toContain("q=Peking");
      expect(lastUrl).toContain("geo_area=Haidian");
    });
  });

  it("keeps logistics users read-only on customer rows", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(customersResponse()));

    render(renderApp({ initialEntries: ["/customers"] }));

    expect(await screen.findByRole("heading", { name: "客户" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增客户" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("creates a customer with an Idempotency-Key and refreshes the list", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(customersResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "cus_new", name: "New Lab" } }), { status: 201 }))
      .mockResolvedValueOnce(customersResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/customers"] }));

    await user.click(await screen.findByRole("button", { name: "新增客户" }));
    await user.type(screen.getByLabelText("客户名称"), "New Lab");
    await user.type(screen.getByLabelText("单位"), "New University");
    await user.type(screen.getByLabelText("区域"), "Chaoyang");
    await user.selectOptions(screen.getByLabelText("结算方式"), "monthly");
    await user.clear(screen.getByLabelText("账期天数"));
    await user.type(screen.getByLabelText("账期天数"), "45");
    await user.click(screen.getByRole("button", { name: "保存客户" }));

    expect(await screen.findByText("客户已创建")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/customers");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      name: "New Lab",
      unit_name: "New University",
      geo_area: "Chaoyang",
      settlement_type: "monthly",
      credit_days: 45
    });
  });

  it("shows required markers on customer fields that the backend contract requires", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(customersResponse()));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/customers"] }));

    await user.click(await screen.findByRole("button", { name: "新增客户" }));

    expect(screen.getByLabelText("客户名称")).toBeInTheDocument();
    expect(screen.getByLabelText("结算方式")).toBeInTheDocument();
    expect(screen.getAllByText("*")).toHaveLength(2);
  });

  it("updates a customer with standard command error handling", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(customersResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "validation_error", message: "Invalid customer", request_id: "req_customer" }
      }), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/customers"] }));

    await user.click(await screen.findByRole("button", { name: "编辑" }));
    await user.clear(screen.getByLabelText("客户名称"));
    await user.type(screen.getByLabelText("客户名称"), "Renamed Lab");
    await user.click(screen.getByRole("button", { name: "保存客户" }));

    expect(await screen.findByText("请检查表单字段。")).toBeInTheDocument();
    expect(screen.getByText("request_id: req_customer")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/customers/cus_001");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
  });
});
