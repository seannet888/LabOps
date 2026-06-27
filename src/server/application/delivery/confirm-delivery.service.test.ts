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
import type { DeliveryTask, Order } from "../shared/types.js";
import { DeliveryApplicationService } from "./delivery-application.service.js";

describe("DeliveryApplicationService.confirmDelivery", () => {
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let orderRepository: InMemoryOrderRepository;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let auditLogs: InMemoryAuditLogRepository;
  let service: DeliveryApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "shipped" })]]);
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "shipped" })]]);
    orderRepository = new InMemoryOrderRepository(orders);
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    auditLogs = new InMemoryAuditLogRepository();
    service = new DeliveryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs,
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("marks the delivery task and order as delivered", async () => {
    const result = await service.confirmDelivery({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      deliveredAt: "2026-06-30",
      note: "上午已补录送达"
    });

    expect(result.data).toEqual({ id: "dt_001", status: "delivered", orderId: "ord_001", orderStatus: "delivered" });
    expect(tasks.get("dt_001")?.status).toBe("delivered");
    expect(tasks.get("dt_001")?.deliveredAt).toBe("2026-06-30");
    expect(orders.get("ord_001")?.status).toBe("delivered");
    expect(auditLogs.entries).toEqual([
      {
        actorId: "user_logistics",
        action: "confirm_delivery",
        entityType: "delivery_task",
        entityId: "dt_001",
        newValue: { deliveredAt: "2026-06-30", note: "上午已补录送达" }
      }
    ]);
  });

  it("throws StateConflictError when the delivery task has not shipped yet", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "scheduled" }));

    await expect(
      service.confirmDelivery({ deliveryTaskId: "dt_001", actorId: "user_logistics", idempotencyKey: "idem_1" })
    ).rejects.toThrow(StateConflictError);
  });

  it("returns the original result on a duplicate idempotency key", async () => {
    const first = await service.confirmDelivery({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1"
    });

    const second = await service.confirmDelivery({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1"
    });

    expect(second).toEqual(first);
  });
  it("runs delivery confirmation through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalOrders = new Map([["ord_001", buildOrder({ status: "shipped" })]]);
    const transactionalTasks = new Map([["dt_001", buildDeliveryTask({ status: "shipped" })]]);
    const transactionalService = new DeliveryApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder({ status: "confirmed" })]])),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]])),
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: new InMemoryOrderRepository(transactionalOrders),
            deliveryTasks: new InMemoryDeliveryTaskRepository(transactionalTasks),
            inventory: new InMemoryInventoryRepository(),
            documents: new InMemoryDocumentRepository(),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    const result = await transactionalService.confirmDelivery({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1"
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.status).toBe("delivered");
    expect(transactionalTasks.get("dt_001")?.status).toBe("delivered");
    expect(transactionalOrders.get("ord_001")?.status).toBe("delivered");
  });
});

