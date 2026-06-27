import { beforeEach, describe, expect, it } from "vitest";
import { InventoryInsufficientError, StateConflictError } from "../errors.js";
import {
  buildDeliveryTask,
  buildOrder,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import type { InventoryBatchCandidate } from "../../domain/inventory-policy.js";
import { InMemoryAuditLogRepository } from "../shared/test-fixtures.js";
import { InventoryApplicationService } from "./inventory-application.service.js";

describe("InventoryApplicationService.getShipmentSuggestions", () => {
  let orderRepository: InMemoryOrderRepository;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository(
      new Map([
        [
          "ord_001",
          buildOrder({ status: "confirmed", items: [{ id: "item_1", strainId: "strain_c57", ageWeeks: 4, gender: "M", quantity: 5 }] })
        ]
      ])
    );
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(
      new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]])
    );
  });

  function withBatches(batches: InventoryBatchCandidate[]): InMemoryInventoryRepository {
    return new InMemoryInventoryRepository(new Map(), new Map(), new Map([["strain_c57:4:M", batches]]));
  }

  it("recommends the oldest batch first for each order item", async () => {
    const inventory = withBatches([
      { id: "batch_new", birthDate: "2026-06-01", availableQty: 10 },
      { id: "batch_old", birthDate: "2026-05-01", availableQty: 10 }
    ]);
    const service = new InventoryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory,
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    const result = await service.getShipmentSuggestions("dt_001");

    expect(result).toEqual({
      data: [
        {
          orderItemId: "item_1",
          requiredQty: 5,
          suggestedBatches: [{ inventoryBatchId: "batch_old", quantity: 5, reason: "优先老化/先进先出" }]
        }
      ]
    });
  });

  it("spans multiple batches oldest-first when one batch is not enough", async () => {
    const inventory = withBatches([
      { id: "batch_new", birthDate: "2026-06-01", availableQty: 10 },
      { id: "batch_old", birthDate: "2026-05-01", availableQty: 3 }
    ]);
    const service = new InventoryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory,
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    const result = await service.getShipmentSuggestions("dt_001");

    expect(result.data[0]?.suggestedBatches).toEqual([
      { inventoryBatchId: "batch_old", quantity: 3, reason: "优先老化/先进先出" },
      { inventoryBatchId: "batch_new", quantity: 2, reason: "优先老化/先进先出" }
    ]);
  });

  it("throws InventoryInsufficientError when available batches cannot cover the required quantity", async () => {
    const inventory = withBatches([{ id: "batch_old", birthDate: "2026-05-01", availableQty: 2 }]);
    const service = new InventoryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory,
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    await expect(service.getShipmentSuggestions("dt_001")).rejects.toThrow(InventoryInsufficientError);
  });

  it("throws StateConflictError when the delivery task does not exist", async () => {
    const inventory = withBatches([]);
    const service = new InventoryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory,
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });

    await expect(service.getShipmentSuggestions("dt_missing")).rejects.toThrow(StateConflictError);
  });
});
