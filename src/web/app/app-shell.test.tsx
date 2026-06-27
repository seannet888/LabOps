import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./render-app.js";

describe("frontend auth shell", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("logs in, restores /me, and renders the role-aware shell", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          access_token: "token_123",
          token_type: "Bearer",
          user: { id: "usr_sales", username: "sales01", display_name: "销售一号", role: "sales" }
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          id: "usr_sales",
          username: "sales01",
          display_name: "销售一号",
          role: "sales",
          permissions: ["orders:create", "orders:export"]
        }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(renderApp({ initialEntries: ["/login"] }));
    await user.type(screen.getByLabelText("用户名"), "sales01");
    await user.type(screen.getByLabelText("密码"), "pw");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("销售一号")).toBeInTheDocument();
    expect(screen.getByText("sales")).toBeInTheDocument();
    expect(screen.getByLabelText("上海杰思捷实验动物有限公司")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "审计" })).not.toBeInTheDocument();
  });

  it("clears an expired token and sends the user back to login", async () => {
    localStorage.setItem("labops_access_token", "expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "unauthorized", message: "Unauthorized", request_id: "req_401" }
    }), { status: 401 })));

    render(renderApp({ initialEntries: ["/orders"] }));

    await waitFor(() => expect(localStorage.getItem("labops_access_token")).toBeNull());
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
  });
});
