import { describe, expect, it } from "vitest";
import { buildOrder, InMemoryAuditLogRepository, InMemoryCatalogRepository, InMemoryDeliveryTaskRepository, InMemoryIdempotencyRepository, InMemoryInventoryRepository, InMemoryOrderRepository } from "../shared/test-fixtures.js";
import { OrderApplicationService } from "./order-application.service.js";

describe("OrderApplicationService.listOrders", () => {
  it("filters orders by customer and status", async () => {
    const orders = new Map([
      ["ord_001", buildOrder({ status: "pending", customerId: "cus_001" })],
      ["ord_002", buildOrder({ id: "ord_002", status: "confirmed", customerId: "cus_002" })]
    ]);
    const service = new OrderApplicationService({
      orders: new InMemoryOrderRepository(orders),
      catalog: new InMemoryCatalogRepository(),
      inventory: new InMemoryInventoryRepository(),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    const result = await service.listOrders({ customerId: "cus_001", page: 1, limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.data[0]?.id).toBe("ord_001");
  });
});
