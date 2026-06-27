import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmShipment,
  getDeliveryTask,
  listDeliveryTasks,
  mapDeliveryTaskDto,
  toConfirmShipmentDto
} from "./delivery.api.js";

describe("delivery frontend API boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps delivery task DTOs to camelCase models", () => {
    expect(mapDeliveryTaskDto({
      id: "dt_001",
      order_id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      status: "pending_schedule",
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
      delivered_at: "2026-06-28",
      sales_action_required: false,
      sales_action_note: "客户改地址",
      document_readiness: {
        certificate_uploaded: false,
        invoice_registered: false,
        requires_invoice: true
      }
    })).toEqual({
      id: "dt_001",
      orderId: "ord_001",
      orderNumber: "XS20260626a3f8b2c1",
      status: "pending_schedule",
      customerName: "Peking Lab",
      geoArea: "海淀",
      deliveryAddress: "北京市海淀区xxx楼xxx室",
      contactName: "李同学",
      contactPhone: "13800000000",
      plannedDeliveryDate: "2026-06-27",
      vehicle: "京A12345",
      driver: "张师傅",
      deliveryBatch: "BATCH-01",
      routeNotes: "上午送达",
      deliveredAt: "2026-06-28",
      salesActionRequired: false,
      salesActionNote: "客户改地址",
      documentReadiness: {
        certificateUploaded: false,
        invoiceRegistered: false,
        requiresInvoice: true
      }
    });
  });

  it("serializes delivery list filters with snake_case query keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [],
      meta: { page: 1, per_page: 20, total: 0, total_pages: 0 },
      links: {}
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listDeliveryTasks({
      page: 1,
      perPage: 20,
      status: "pending_schedule",
      plannedDeliveryDate: "2026-06-27",
      geoArea: "海淀"
    }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/delivery-tasks?page=1&per_page=20&status=pending_schedule&planned_delivery_date=2026-06-27&geo_area=%E6%B5%B7%E6%B7%80");
  });

  it("fetches delivery task detail through the resource endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "dt_001",
        order_id: "ord_001",
        order_number: "XS20260626a3f8b2c1",
        status: "scheduled",
        customer_name: "Peking Lab",
        planned_delivery_date: "2026-06-27",
        vehicle: "京A12345",
        driver: "张师傅"
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const task = await getDeliveryTask("dt_001", "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/delivery-tasks/dt_001");
    expect(task).toMatchObject({
      id: "dt_001",
      orderNumber: "XS20260626a3f8b2c1",
      customerName: "Peking Lab",
      vehicle: "京A12345",
      driver: "张师傅"
    });
  });

  it("confirms shipment through commandRequest with user-confirmed stock deductions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "dt_001", status: "shipped", order_id: "ord_001", order_status: "shipped" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await confirmShipment("dt_001", {
      stockDeductions: [{ orderItemId: "item_1", inventoryBatchId: "batch_1", quantity: 10 }],
      documentRelease: { missingCertificate: true, missingInvoice: false, reason: "纸质随货" }
    }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/delivery-tasks/dt_001/confirm-shipment");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(toConfirmShipmentDto({
      stockDeductions: [{ orderItemId: "item_1", inventoryBatchId: "batch_1", quantity: 10 }],
      documentRelease: { missingCertificate: true, missingInvoice: false, reason: "纸质随货" }
    }));
  });
});
