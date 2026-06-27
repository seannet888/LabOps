import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmOrder,
  getOrder,
  listOrders,
  mapOrderDto,
  toChangeOrderPricesDto,
  toCreateOrderDto
} from "./orders.api.js";

describe("orders frontend API boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps order list DTOs to camelCase models", () => {
    expect(mapOrderDto({
      id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      customer_id: "cus_001",
      customer_name: "Peking Lab",
      status: "confirmed",
      total_amount: "560.00",
      requires_invoice: true,
      invoice_type: "tech_service",
      created_at: "2026-06-25T10:30:00.000Z"
    })).toEqual({
      id: "ord_001",
      orderNumber: "XS20260626a3f8b2c1",
      customerId: "cus_001",
      customerName: "Peking Lab",
      status: "confirmed",
      totalAmount: "560.00",
      requiresInvoice: true,
      invoiceType: "tech_service",
      createdAt: "2026-06-25T10:30:00.000Z"
    });
  });

  it("serializes list filters and command payloads through explicit mappers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [],
      meta: { page: 2, per_page: 20, total: 0, total_pages: 0 },
      links: { self: "/api/v1/orders?page=2" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listOrders({ page: 2, perPage: 20, customerId: "cus_001", status: "confirmed" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/orders?page=2&per_page=20&customer_id=cus_001&status=confirmed");
    expect(toCreateOrderDto({
      customerId: "cus_001",
      deliveryMethod: "self_vehicle",
      plannedDeliveryDate: "2026-06-27",
      requiresInvoice: true,
      invoiceType: "tech_service",
      notes: "上午送达",
      items: [{ strainId: "str_001", ageWeeks: 5, gender: "M", quantity: 20, actualPrice: "28.00" }]
    })).toEqual({
      customer_id: "cus_001",
      delivery_method: "self_vehicle",
      planned_delivery_date: "2026-06-27",
      requires_invoice: true,
      invoice_type: "tech_service",
      notes: "上午送达",
      items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "28.00" }]
    });
    expect(toChangeOrderPricesDto({
      reason: "协议价",
      items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
    })).toEqual({
      reason: "协议价",
      items: [{ order_item_id: "item_1", actual_price: "25.00" }]
    });
  });

  it("fetches order detail through the resource endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "ord_001",
        order_number: "XS20260626a3f8b2c1",
        status: "confirmed",
        total_amount: "560.00"
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await getOrder("ord_001", "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/orders/ord_001");
    expect(order).toMatchObject({ id: "ord_001", orderNumber: "XS20260626a3f8b2c1", totalAmount: "560.00" });
  });

  it("sends order commands through commandRequest with an Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "ord_001", status: "confirmed", delivery_task_id: "dt_001" },
      meta: { events: ["order_confirmed"] }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await confirmOrder("ord_001", { confirmNote: "客户确认" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/orders/ord_001/confirm");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ confirm_note: "客户确认" }));
  });
});
