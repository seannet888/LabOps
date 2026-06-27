import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomer, listCustomers, mapCustomerDto, updateCustomer } from "./customers.api.js";

const customerDto = {
  id: "cus_001",
  name: "Peking Lab",
  unit_name: "Peking University",
  research_group: "Wang Lab",
  geo_area: "Haidian",
  settlement_type: "monthly" as const,
  credit_days: 60,
  default_delivery_method: "self_vehicle",
  default_invoice_type: "tech_service",
  notes: "VIP animal room",
  is_active: true
};

describe("customers api boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps customer DTOs to frontend models", () => {
    expect(mapCustomerDto(customerDto)).toEqual({
      id: "cus_001",
      name: "Peking Lab",
      unitName: "Peking University",
      researchGroup: "Wang Lab",
      geoArea: "Haidian",
      settlementType: "monthly",
      creditDays: 60,
      defaultDeliveryMethod: "self_vehicle",
      defaultInvoiceType: "tech_service",
      notes: "VIP animal room",
      isActive: true
    });
  });

  it("serializes list filters using backend query keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [customerDto],
      meta: { page: 2, per_page: 20, total: 1, total_pages: 1 },
      links: { self: "/api/v1/customers?page=2" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listCustomers({ page: 2, perPage: 20, q: "Peking", geoArea: "Haidian" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/customers?page=2&per_page=20&q=Peking&geo_area=Haidian");
    expect(result.data[0]?.name).toBe("Peking Lab");
  });

  it("sends customer commands with Idempotency-Key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "cus_new", name: "New Lab" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "cus_new" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createCustomer({ name: "New Lab", settlementType: "monthly", creditDays: 45 }, "token_123");
    await updateCustomer("cus_new", { name: "Renamed Lab", settlementType: "single" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/customers");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: "New Lab",
      settlement_type: "monthly",
      credit_days: 45
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/customers/cus_new");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      name: "Renamed Lab",
      settlement_type: "single"
    });
  });
});
