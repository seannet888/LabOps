import { describe, expect, it } from "vitest";
import {
  buildDeliveryTask,
  InMemoryAuditLogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryDocumentRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import { DeliveryApplicationService } from "./delivery-application.service.js";

describe("DeliveryApplicationService.listDeliveryTasks", () => {
  it("filters delivery tasks by status", async () => {
    const tasks = new Map([
      ["dt_001", buildDeliveryTask({ status: "pending_schedule" })],
      ["dt_002", buildDeliveryTask({ id: "dt_002", status: "scheduled" })]
    ]);
    const service = new DeliveryApplicationService({
      orders: new InMemoryOrderRepository(new Map()),
      deliveryTasks: new InMemoryDeliveryTaskRepository(tasks),
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    const result = await service.listDeliveryTasks({ status: "scheduled", page: 1, limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.data[0]?.id).toBe("dt_002");
  });
});
