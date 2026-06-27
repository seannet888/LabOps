import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, InventoryInsufficientError, StateConflictError } from "../errors.js";
import {
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryCatalogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import type { Order } from "../shared/types.js";
import { OrderApplicationService, type OrderApplicationTransactionContext } from "./order-application.service.js";

describe("OrderApplicationService.confirmOrder", () => {
  let orders: Map<string, Order>;
  let orderRepository: InMemoryOrderRepository;
  let inventoryRepository: InMemoryInventoryRepository;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let idempotencyRepository: InMemoryIdempotencyRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder()]]);
    orderRepository = new InMemoryOrderRepository(orders);
    inventoryRepository = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 20]]));
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(new Map());
    auditLogRepository = new InMemoryAuditLogRepository();
    idempotencyRepository = new InMemoryIdempotencyRepository();
    service = new OrderApplicationService({
      orders: orderRepository,
      catalog: new InMemoryCatalogRepository(),
      inventory: inventoryRepository,
      deliveryTasks: deliveryTaskRepository,
      auditLogs: auditLogRepository,
      idempotency: idempotencyRepository
    });
  });

  it("confirms a pending order with sufficient availability", async () => {
    const result = await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1"
    });

    expect(result.data.status).toBe("confirmed");
    expect(result.data.deliveryTaskId).toBe("dt_1");
    expect(result.meta.events).toEqual(["order_confirmed", "inventory_reserved", "delivery_task_created"]);
  });

  it("reserves aggregate inventory without binding a specific batch", async () => {
    await service.confirmOrder({ orderId: "ord_001", actor: "sales", actorId: "user_1", idempotencyKey: "idem_1" });

    expect(await inventoryRepository.getAvailableQty("strain_c57", 4, "M")).toBe(10);
  });

  it("creates a delivery task in pending_schedule status", async () => {
    const result = await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1"
    });

    const task = await deliveryTaskRepository.findById(result.data.deliveryTaskId);
    expect(task).toEqual({ id: "dt_1", orderId: "ord_001", status: "pending_schedule" });
  });

  it("writes an audit log entry", async () => {
    await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1",
      confirmNote: "客户微信确认"
    });

    expect(auditLogRepository.entries).toEqual([
      {
        actorId: "user_1",
        action: "confirm_order",
        entityType: "order",
        entityId: "ord_001",
        newValue: { confirmNote: "客户微信确认" }
      }
    ]);
  });

  it("throws InventoryInsufficientError when availability is too low", async () => {
    inventoryRepository = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 3]]));
    service = new OrderApplicationService({
      orders: orderRepository,
      catalog: new InMemoryCatalogRepository(),
      inventory: inventoryRepository,
      deliveryTasks: deliveryTaskRepository,
      auditLogs: auditLogRepository,
      idempotency: idempotencyRepository
    });

    await expect(
      service.confirmOrder({ orderId: "ord_001", actor: "sales", actorId: "user_1", idempotencyKey: "idem_1" })
    ).rejects.toThrow(InventoryInsufficientError);
  });

  it("throws StateConflictError when the order is already confirmed", async () => {
    orders.set("ord_001", buildOrder({ status: "confirmed" }));

    await expect(
      service.confirmOrder({ orderId: "ord_001", actor: "sales", actorId: "user_1", idempotencyKey: "idem_1" })
    ).rejects.toThrow(StateConflictError);
  });

  it("returns the original result on a duplicate idempotency key without reserving inventory twice", async () => {
    const first = await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1"
    });

    orders.set("ord_001", buildOrder({ status: "confirmed" }));

    const second = await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1"
    });

    expect(second).toEqual(first);
    expect(await inventoryRepository.getAvailableQty("strain_c57", 4, "M")).toBe(10);
  });

  it("throws ConflictError when the same idempotency key is reused for a different command payload", async () => {
    await service.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_1",
      idempotencyKey: "idem_1"
    });

    orders.set("ord_002", buildOrder({ id: "ord_002" }));

    await expect(
      service.confirmOrder({
        orderId: "ord_002",
        actor: "sales",
        actorId: "user_1",
        idempotencyKey: "idem_1"
      })
    ).rejects.toThrow(ConflictError);
  });


  it("runs confirmation writes through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    let outerReserveCalls = 0;
    let transactionalReserveCalls = 0;
    const transactionalInventory = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 20]]));
    const originalTransactionalReserve = transactionalInventory.reserve.bind(transactionalInventory);
    transactionalInventory.reserve = async (...args) => {
      transactionalReserveCalls += 1;
      return originalTransactionalReserve(...args);
    };
    const originalOuterReserve = inventoryRepository.reserve.bind(inventoryRepository);
    inventoryRepository.reserve = async (...args) => {
      outerReserveCalls += 1;
      return originalOuterReserve(...args);
    };

    service = new OrderApplicationService({
      orders: orderRepository,
      catalog: new InMemoryCatalogRepository(),
      inventory: inventoryRepository,
      deliveryTasks: deliveryTaskRepository,
      auditLogs: auditLogRepository,
      idempotency: idempotencyRepository,
      transactions: {
        run: async <T>(callback: (context: OrderApplicationTransactionContext) => Promise<T>): Promise<T> => {
          transactionCalls += 1;
          return callback({
            orders: orderRepository,
            catalog: new InMemoryCatalogRepository(),
            inventory: transactionalInventory,
            deliveryTasks: deliveryTaskRepository,
            auditLogs: auditLogRepository,
            idempotency: idempotencyRepository
          });
        }
      }
    });

    await service.confirmOrder({ orderId: "ord_001", actor: "sales", actorId: "user_1", idempotencyKey: "idem_1" });

    expect(transactionCalls).toBe(1);
    expect(outerReserveCalls).toBe(0);
    expect(transactionalReserveCalls).toBe(1);
  });
});
