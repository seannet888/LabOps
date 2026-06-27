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

function auditLogsResponse() {
  return new Response(JSON.stringify({
    data: [{
      id: "aud_001",
      actor_id: "usr_manager",
      actor_name: "Manager",
      action: "confirm_order",
      entity_type: "order",
      entity_id: "ord_001",
      old_value: { status: "pending" },
      new_value: { deliveredAt: "2026-06-30", note: "E2E delivered" },
      reason: "客户确认",
      created_at: "2026-06-25T11:00:00.000Z"
    }],
    meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    links: { self: "/api/v1/audit-logs?page=1" }
  }), { status: 200 });
}

describe("audit logs page", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders audit rows and keeps filters in the API query", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValue(auditLogsResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/audit-logs"] }));

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "确认订单" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "order" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "ord_001" })).toBeInTheDocument();
    expect(screen.getByText("送达日期：2026-06-30；备注：E2E delivered")).toBeInTheDocument();

    await user.type(screen.getByLabelText("实体类型筛选"), "order");
    await user.type(screen.getByLabelText("实体 ID 筛选"), "ord_001");
    await user.click(screen.getByRole("button", { name: "筛选" }));

    await waitFor(() => {
      const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("per_page=20");
      expect(lastUrl).toContain("entity_type=order");
      expect(lastUrl).toContain("entity_id=ord_001");
    });
  });

  it("hides audit navigation from sales users and shows backend 403 if directly opened", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "forbidden", message: "Forbidden", request_id: "req_forbidden" }
      }), { status: 403 })));

    render(renderApp({ initialEntries: ["/audit-logs"] }));

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "审计" })).not.toBeInTheDocument();
    expect(await screen.findByText("无权限执行该操作。")).toBeInTheDocument();
    expect(screen.getByText("request_id: req_forbidden")).toBeInTheDocument();
  });
});
