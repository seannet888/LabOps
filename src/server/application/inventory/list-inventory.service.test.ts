import { describe, expect, it } from "vitest";
import {
  buildDeliveryTask,
  buildInventoryBatch,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import { InventoryApplicationService } from "./inventory-application.service.js";

function buildService(inventory: InMemoryInventoryRepository): InventoryApplicationService {
  return new InventoryApplicationService({
    orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder()]])),
    deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([["dt_001", buildDeliveryTask()]])),
    inventory,
    auditLogs: new InMemoryAuditLogRepository(),
    idempotency: new InMemoryIdempotencyRepository()
  });
}

describe("InventoryApplicationService.listBatches", () => {
  it("paginates inventory batches", async () => {
    const inventory = new InMemoryInventoryRepository(
      new Map(),
      new Map([
        ["inv_001", buildInventoryBatch({ id: "inv_001", availableQty: 80 })],
        ["inv_002", buildInventoryBatch({ id: "inv_002", availableQty: 50 })]
      ])
    );
    const service = buildService(inventory);

    const result = await service.listBatches({ page: 1, limit: 1 });

    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(1);
  });
});

describe("InventoryApplicationService.getAvailability", () => {
  it("returns the aggregate availability for a strain/age/gender combination", async () => {
    const inventory = new InMemoryInventoryRepository(new Map([["str_001:5:M", 80]]));
    const service = buildService(inventory);

    const result = await service.getAvailability({ strainId: "str_001", ageWeeks: 5, gender: "M" });

    expect(result.data).toEqual({ availableQty: 80, reservedQty: 0, agingQty: 0 });
  });
});
