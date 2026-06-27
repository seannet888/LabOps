import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, buildQueryString, commandRequest, request } from "./api-client.js";

describe("frontend API client contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses resource and list envelopes through the shared client", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "ord_1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "ord_1" }],
        meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
        links: { self: "/api/v1/orders?page=1" }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request<{ id: string }>("/orders")).resolves.toEqual({ id: "ord_1" });
    await expect(request("/orders?page=1")).resolves.toEqual({
      data: [{ id: "ord_1" }],
      meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
      links: { self: "/api/v1/orders?page=1" }
    });
  });

  it("builds query strings without empty values while preserving contract keys", () => {
    expect(buildQueryString({
      page: 1,
      per_page: 20,
      strain_id: "str_001",
      gender: "",
      status: undefined
    })).toBe("?page=1&per_page=20&strain_id=str_001");
  });

  it("throws a typed ApiClientError for the standard backend error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "validation_error",
        message: "Invalid input",
        details: { field: "birth_date" },
        request_id: "req_123"
      }
    }), { status: 422 })));

    await expect(request("/inventory-batches")).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
      message: "Invalid input",
      requestId: "req_123"
    } satisfies Partial<ApiClientError>);
  });

  it("adds Authorization and Idempotency-Key only for command requests", async () => {
    const fetchMock = vi.fn().mockImplementation(() => (
      Promise.resolve(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }))
    ));
    vi.stubGlobal("fetch", fetchMock);

    await request("/me", { token: "token_123" });
    await commandRequest("/orders/ord_1/confirm", { method: "POST", token: "token_123", body: { confirm_note: "ok" } });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer token_123" });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("idempotency-key");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
  });

  it("allows commands to reuse a provided Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockImplementation(() => (
      Promise.resolve(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }))
    ));
    vi.stubGlobal("fetch", fetchMock);

    await commandRequest("/orders/ord_1/confirm", {
      token: "token_123",
      idempotencyKey: "fixed-key",
      body: { confirm_note: "retry same payload" }
    });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "idempotency-key": "fixed-key"
    });
  });
});
