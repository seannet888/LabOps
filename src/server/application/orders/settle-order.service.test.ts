import { beforeEach, describe, expect, it } from "vitest";
import { StateConflictError } from "../errors.js";
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
import { OrderApplicationService } from "./order-application.service.js";

describe("OrderApplicationService.settleOrder", () => {
  let orders: Map<string, Order>;
  let orderRepository: InMemoryOrderRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "invoiced" })]]);
    orderRepository = new InMemoryOrderRepository(orders);
    auditLogRepository = new InMemoryAuditLogRepository();
    service = new OrderApplicationService({
      orders: orderRepository,
      catalog: new InMemoryCatalogRepository(),
      inventory: new InMemoryInventoryRepository(),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
      auditLogs: auditLogRepository,
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("transitions an invoiced order to settled", async () => {
    const result = await service.settleOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      paymentMethod: "bank_transfer"
    });

    expect(result.data.status).toBe("settled");
    expect(orders.get("ord_001")?.status).toBe("settled");
  });

  it("writes an audit log entry", async () => {
    await service.settleOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      paymentMethod: "bank_transfer"
    });

    expect(auditLogRepository.entries).toEqual([
      { actorId: "user_sales", action: "settle", entityType: "order", entityId: "ord_001" }
    ]);
  });

  it("throws StateConflictError when the order has not been invoiced yet", async () => {
    orders.set("ord_001", buildOrder({ status: "delivered" }));

    await expect(
      service.settleOrder({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        paymentMethod: "bank_transfer"
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs settlement through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalOrders = new Map([["ord_001", buildOrder({ status: "invoiced" })]]);
    const transactionalService = new OrderApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder({ status: "delivered" })]])),
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
            inventory: new InMemoryInventoryRepository(),
            deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    const result = await transactionalService.settleOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      paymentMethod: "bank_transfer"
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.status).toBe("settled");
    expect(transactionalOrders.get("ord_001")?.status).toBe("settled");
  });
});

