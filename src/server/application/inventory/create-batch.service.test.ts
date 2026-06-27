import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDeliveryTask,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import { InventoryApplicationService } from "./inventory-application.service.js";

describe("InventoryApplicationService.createBatch", () => {
  let auditLogs: InMemoryAuditLogRepository;
  let service: InventoryApplicationService;

  beforeEach(() => {
    auditLogs = new InMemoryAuditLogRepository();
    service = new InventoryApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder()]])),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([["dt_001", buildDeliveryTask()]])),
      inventory: new InMemoryInventoryRepository(),
      auditLogs,
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("creates an inventory batch and writes a light-audit entry", async () => {
    const result = await service.createBatch({
      actorId: "user_sales",
      idempotencyKey: "batch-1",
      strainId: "str_001",
      birthDate: "2026-05-21",
      gender: "M",
      initialQty: 100,
      entryDate: "2026-05-22",
      notes: "A架"
    });

    expect(result.data.id).toBeTruthy();
    expect(auditLogs.entries).toEqual([
      { actorId: "user_sales", action: "create_batch", entityType: "inventory_batch", entityId: result.data.id }
    ]);
  });
  it("runs batch creation through the transaction runner", async () => {
    let transactionCalls = 0;
    const service = new InventoryApplicationService({
      orders: new InMemoryOrderRepository(new Map([['ord_001', buildOrder()]])),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([['dt_001', buildDeliveryTask()]])),
      inventory: new InMemoryInventoryRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: new InMemoryOrderRepository(new Map([['ord_001', buildOrder()]])),
            deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([['dt_001', buildDeliveryTask()]])),
            inventory: new InMemoryInventoryRepository(),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    await service.createBatch({
      actorId: "user_sales",
      idempotencyKey: "batch-1",
      strainId: "str_001",
      birthDate: "2026-05-21",
      gender: "M",
      initialQty: 100,
      entryDate: "2026-05-22"
    });

    expect(transactionCalls).toBe(1);
  });

  it("returns the original result on a duplicate idempotency key without creating another audit log", async () => {
    const input = {
      actorId: "user_sales",
      idempotencyKey: "batch-1",
      strainId: "str_001",
      birthDate: "2026-05-21",
      gender: "M" as const,
      initialQty: 100,
      entryDate: "2026-05-22"
    };

    const first = await service.createBatch(input);
    const second = await service.createBatch(input);

    expect(second).toEqual(first);
    expect(auditLogs.entries).toHaveLength(1);
  });
});

