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

describe("OrderApplicationService.archiveDocuments", () => {
  let orders: Map<string, Order>;
  let orderRepository: InMemoryOrderRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "delivered" })]]);
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

  it("transitions a delivered order to invoiced", async () => {
    const result = await service.archiveDocuments({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      note: "合格证扫描件和发票信息已归档"
    });

    expect(result.data.status).toBe("invoiced");
    expect(orders.get("ord_001")?.status).toBe("invoiced");
  });

  it("writes an audit log entry", async () => {
    await service.archiveDocuments({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      note: "合格证扫描件和发票信息已归档"
    });

    expect(auditLogRepository.entries).toEqual([
      { actorId: "user_sales", action: "archive_documents", entityType: "order", entityId: "ord_001" }
    ]);
  });

  it("throws StateConflictError when the order has not been delivered yet", async () => {
    orders.set("ord_001", buildOrder({ status: "confirmed" }));

    await expect(
      service.archiveDocuments({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        note: "合格证扫描件和发票信息已归档"
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs document archival through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalOrders = new Map([["ord_001", buildOrder({ status: "delivered" })]]);
    const transactionalService = new OrderApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder({ status: "confirmed" })]])),
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

    const result = await transactionalService.archiveDocuments({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      note: "合格证扫描件和发票信息已归档"
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.status).toBe("invoiced");
    expect(transactionalOrders.get("ord_001")?.status).toBe("invoiced");
  });
});

