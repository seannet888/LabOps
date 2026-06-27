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

function batchesResponse() {
  return new Response(JSON.stringify({
    data: [{
      id: "inv_001",
      strain_id: "str_001",
      strain_name: "C57BL/6",
      species_name: "小鼠",
      birth_date: "2026-05-21",
      age_weeks: 5,
      gender: "M",
      initial_qty: 100,
      reserved_qty: 20,
      available_qty: 75,
      is_aging: false,
      entry_date: "2026-05-22"
    }],
    meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    links: { self: "/api/v1/inventory-batches?page=1" }
  }), { status: 200 });
}

function speciesResponse() {
  return new Response(JSON.stringify({
    data: [
      { id: "spc_mouse", name: "小鼠", grade: "SPF" },
      { id: "spc_rat", name: "大鼠", grade: "SPF" }
    ]
  }), { status: 200 });
}

function strainsResponse() {
  return new Response(JSON.stringify({
    data: [
      { id: "str_001", species_id: "spc_mouse", name: "C57BL/6", is_active: true },
      { id: "str_002", species_id: "spc_rat", name: "SD", is_active: true }
    ]
  }), { status: 200 });
}

function allStrainsResponse() {
  return new Response(JSON.stringify({
    data: [
      { id: "str_001", species_id: "spc_mouse", name: "C57BL/6", is_active: true },
      { id: "str_002", species_id: "spc_rat", name: "SD", is_active: true },
      { id: "str_inactive", species_id: "spc_mouse", name: "DBA/2", is_active: false }
    ]
  }), { status: 200 });
}

describe("inventory pages", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders inventory batches from the backend contract", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse()));

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    expect(await screen.findByRole("heading", { name: "库存批次" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "C57BL/6" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "75只" })).toBeInTheDocument();
  });

  it("hides the create-batch action from logistics users", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("logistics"))
      .mockResolvedValueOnce(batchesResponse()));

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    expect(await screen.findByRole("heading", { name: "库存批次" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增入库" })).not.toBeInTheDocument();
  });

  it("validates create-batch dates before submitting", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    expect(screen.getByLabelText("物种")).toBeInTheDocument();
    expect(screen.getByLabelText("入库数量")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "小鼠 / C57BL/6" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "大鼠 / SD" })).toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText("品系"), "str_001");
    expect(screen.getByDisplayValue("小鼠")).toBeInTheDocument();
    await user.type(screen.getByLabelText("出生日期"), "2026-05-22");
    await user.selectOptions(screen.getByLabelText("性别"), "M");
    await user.type(screen.getByLabelText("入库数量"), "100");
    await user.type(screen.getByLabelText("入库日期"), "2026-05-21");
    await user.click(screen.getByRole("button", { name: "保存入库" }));

    expect(await screen.findByText("入库日期不能早于出生日期")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("keeps inventory filters in the URL query", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValue(batchesResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.type(await screen.findByLabelText("品系筛选"), "str_001");
    await user.selectOptions(screen.getByLabelText("性别筛选"), "M");
    await user.click(screen.getByRole("button", { name: "筛选" }));

    expect(await screen.findByDisplayValue("str_001")).toBeInTheDocument();
    await waitFor(() => {
      const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("per_page=20");
      expect(lastUrl).toContain("strain_id=str_001");
      expect(lastUrl).toContain("gender=M");
    });
  });

  it("shows success toast after creating an inventory batch", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "inv_new" } }), { status: 201 }))
      .mockResolvedValueOnce(batchesResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    await user.selectOptions(await screen.findByLabelText("品系"), "str_001");
    await user.type(screen.getByLabelText("出生日期"), "2026-05-21");
    await user.selectOptions(screen.getByLabelText("性别"), "M");
    await user.type(screen.getByLabelText("入库数量"), "100");
    await user.type(screen.getByLabelText("入库日期"), "2026-05-22");
    await user.click(screen.getByRole("button", { name: "保存入库" }));

    expect(await screen.findByText("入库已创建")).toBeInTheDocument();
    expect(fetchMock.mock.calls[4]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toMatchObject({ strain_id: "str_001" });
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).not.toHaveProperty("species_name");
  });

  it("lets managers create a strain inside the create-batch dialog", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse())
      .mockResolvedValueOnce(allStrainsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "str_new", species_id: "spc_mouse", name: "NOD", is_active: true }
      }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    await user.click(await screen.findByRole("button", { name: "管理品系" }));
    await user.selectOptions(screen.getByLabelText("品类"), "spc_mouse");
    await user.type(screen.getByLabelText("品系名称"), "NOD");
    await user.click(screen.getByRole("button", { name: "保存品系" }));

    expect(await screen.findByText("品系已创建")).toBeInTheDocument();
    expect(screen.getByDisplayValue("小鼠")).toBeInTheDocument();
    expect(screen.getByLabelText("品系")).toHaveValue("str_new");
    const createStrainCall = fetchMock.mock.calls.find((call) => call[0] === "/api/v1/strains" && call[1]?.method === "POST");
    expect(createStrainCall?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(createStrainCall?.[1]?.body))).toEqual({
      species_id: "spc_mouse",
      name: "NOD"
    });
  });

  it("does not show strain management to sales users", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse()));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));

    expect(screen.queryByRole("button", { name: "管理品系" })).not.toBeInTheDocument();
  });

  it("lets managers deactivate existing strains from the create-batch dialog", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse())
      .mockResolvedValueOnce(allStrainsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "str_001", is_active: false }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    expect(await screen.findByRole("option", { name: "小鼠 / C57BL/6" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "管理品系" }));
    await user.click(screen.getByRole("button", { name: "停用 C57BL/6" }));

    expect(await screen.findByText("品系已停用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回入库" }));
    expect(screen.queryByRole("option", { name: "小鼠 / C57BL/6" })).not.toBeInTheDocument();
    const deactivateCall = fetchMock.mock.calls.find((call) => call[0] === "/api/v1/strains/str_001");
    expect(deactivateCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(deactivateCall?.[1]?.body))).toEqual({ is_active: false });
  });

  it("lets managers reactivate inactive strains from the create-batch dialog", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse())
      .mockResolvedValueOnce(allStrainsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "str_inactive", is_active: true }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    expect(screen.queryByRole("option", { name: "小鼠 / DBA/2" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "管理品系" }));
    await user.click(await screen.findByRole("button", { name: "启用 DBA/2" }));

    expect(await screen.findByText("品系已启用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回入库" }));
    expect(await screen.findByRole("option", { name: "小鼠 / DBA/2" })).toBeInTheDocument();
    const reactivateCall = fetchMock.mock.calls.find((call) => call[0] === "/api/v1/strains/str_inactive");
    expect(reactivateCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(reactivateCall?.[1]?.body))).toEqual({ is_active: true });
  });

  it("renders API validation errors with request id", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("manager"))
      .mockResolvedValueOnce(batchesResponse())
      .mockResolvedValueOnce(speciesResponse())
      .mockResolvedValueOnce(strainsResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "validation_error", message: "Invalid input", request_id: "req_422" }
      }), { status: 422 })));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/batches"] }));

    await user.click(await screen.findByRole("button", { name: "新增入库" }));
    await user.selectOptions(await screen.findByLabelText("品系"), "str_001");
    await user.type(screen.getByLabelText("出生日期"), "2026-05-21");
    await user.selectOptions(screen.getByLabelText("性别"), "M");
    await user.type(screen.getByLabelText("入库数量"), "100");
    await user.type(screen.getByLabelText("入库日期"), "2026-05-22");
    await user.click(screen.getByRole("button", { name: "保存入库" }));

    expect(await screen.findByText("请检查表单字段。")).toBeInTheDocument();
    expect(screen.getByText("request_id: req_422")).toBeInTheDocument();
  });

  it("queries and renders inventory availability from backend facts", async () => {
    localStorage.setItem("labops_access_token", "token_123");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(me("sales"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          strain_id: "str_001",
          age_weeks: 5,
          gender: "M",
          available_qty: 75,
          reserved_qty: 20,
          aging_qty: 0
        }
      }), { status: 200 })));
    const user = userEvent.setup();

    render(renderApp({ initialEntries: ["/inventory/availability"] }));

    await user.type(await screen.findByLabelText("品系 ID"), "str_001");
    await user.type(screen.getByLabelText("周龄"), "5");
    await user.selectOptions(screen.getByLabelText("性别"), "M");
    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("75只")).toBeInTheDocument();
    expect(screen.getByText("20只")).toBeInTheDocument();
    expect(screen.getByText("0只")).toBeInTheDocument();
  });
});
