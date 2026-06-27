import { beforeEach, describe, expect, it } from "vitest";
import { StateConflictError } from "../errors.js";
import {
  buildDeliveryTask,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryCatalogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import type { DeliveryTask, Order } from "../shared/types.js";
import { OrderApplicationService } from "./order-application.service.js";

describe("OrderApplicationService.cancelOrder", () => {
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let inventory: InMemoryInventoryRepository;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "pending_schedule" })]]);
    inventory = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 10]]));
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    service = new OrderApplicationService({
      orders: new InMemoryOrderRepository(orders),
      catalog: new InMemoryCatalogRepository(),
      inventory,
      deliveryTasks: deliveryTaskRepository,
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("cancels a confirmed order and releases its reserved inventory", async () => {
    const result = await service.cancelOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户取消实验计划"
    });

    expect(result.data.status).toBe("cancelled");
    expect(orders.get("ord_001")?.status).toBe("cancelled");
    expect(inventory.releasedAllocations).toEqual(["item_1"]);
  });

  it("cancels the associated delivery task when it has not shipped", async () => {
    await service.cancelOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户取消实验计划"
    });

    expect(tasks.get("dt_001")?.status).toBe("cancelled");
  });

  it("does not touch the delivery task once it has shipped", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "shipped" }));
    orders.set("ord_001", buildOrder({ status: "shipped" }));

    await expect(
      service.cancelOrder({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        reason: "客户取消实验计划"
      })
    ).rejects.toThrow(StateConflictError);

    expect(tasks.get("dt_001")?.status).toBe("shipped");
  });

  it("throws StateConflictError once the order is already settled", async () => {
    orders.set("ord_001", buildOrder({ status: "settled" }));

    await expect(
      service.cancelOrder({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        reason: "客户取消实验计划"
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs cancellation through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalOrders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
    const transactionalTasks = new Map([["dt_001", buildDeliveryTask({ status: "pending_schedule" })]]);
    const transactionalInventory = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 10]]));
    const transactionalService = new OrderApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder({ status: "settled" })]])),
      catalog: new InMemoryCatalogRepository(),
      inventory: new InMemoryInventoryRepository(),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: new InMemoryOrderRepository(transactionalOrders),
            catalog: new InMemoryCatalogRepository(),
            inventory: transactionalInventory,
            deliveryTasks: new InMemoryDeliveryTaskRepository(transactionalTasks),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    const result = await transactionalService.cancelOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户取消实验计划"
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.status).toBe("cancelled");
    expect(transactionalOrders.get("ord_001")?.status).toBe("cancelled");
    expect(transactionalTasks.get("dt_001")?.status).toBe("cancelled");
    expect(transactionalInventory.releasedAllocations).toEqual(["item_1"]);
  });
});

