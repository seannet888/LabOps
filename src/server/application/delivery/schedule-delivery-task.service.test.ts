import { beforeEach, describe, expect, it } from "vitest";
import { StateConflictError } from "../errors.js";
import {
  buildDeliveryTask,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryDocumentRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import type { DeliveryTask } from "../shared/types.js";
import { DeliveryApplicationService } from "./delivery-application.service.js";

describe("DeliveryApplicationService.scheduleDeliveryTask", () => {
  let tasks: Map<string, DeliveryTask>;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let service: DeliveryApplicationService;

  beforeEach(() => {
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "pending_schedule" })]]);
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    service = new DeliveryApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder()]])),
      deliveryTasks: deliveryTaskRepository,
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("moves a pending_schedule task to scheduled", async () => {
    const result = await service.scheduleDeliveryTask({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      plannedDeliveryDate: "2026-06-27",
      vehicle: "京A12345",
      driver: "王师傅"
    });

    expect(result.data.status).toBe("scheduled");
    expect(tasks.get("dt_001")?.status).toBe("scheduled");
  });

  it("throws StateConflictError when the task is not in pending_schedule", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "shipped" }));

    await expect(
      service.scheduleDeliveryTask({
        deliveryTaskId: "dt_001",
        actorId: "user_logistics",
        idempotencyKey: "idem_1",
        plannedDeliveryDate: "2026-06-27"
      })
    ).rejects.toThrow(StateConflictError);
  });

  it("returns the original result on a duplicate idempotency key", async () => {
    const first = await service.scheduleDeliveryTask({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      plannedDeliveryDate: "2026-06-27"
    });

    const second = await service.scheduleDeliveryTask({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      plannedDeliveryDate: "2026-06-27"
    });

    expect(second).toEqual(first);
  });
  it("runs scheduling through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalTasks = new Map([["dt_001", buildDeliveryTask({ status: "pending_schedule" })]]);
    const transactionalService = new DeliveryApplicationService({
      orders: new InMemoryOrderRepository(new Map([['ord_001', buildOrder()]])),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([["dt_001", buildDeliveryTask({ status: "shipped" })]])),
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: new InMemoryOrderRepository(new Map([['ord_001', buildOrder()]])),
            deliveryTasks: new InMemoryDeliveryTaskRepository(transactionalTasks),
            inventory: new InMemoryInventoryRepository(),
            documents: new InMemoryDocumentRepository(),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    const result = await transactionalService.scheduleDeliveryTask({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      plannedDeliveryDate: "2026-06-27"
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.status).toBe("scheduled");
    expect(transactionalTasks.get("dt_001")?.status).toBe("scheduled");
  });
});

