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

describe("OrderApplicationService.changeOrderPrices", () => {
  let orders: Map<string, Order>;
  let orderRepository: InMemoryOrderRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
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

  it("updates item prices on a confirmed order", async () => {
    const result = await service.changeOrderPrices({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户长期合作协议价",
      items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
    });

    expect(result.data.id).toBe("ord_001");
    expect(orderRepository.priceUpdates).toEqual([
      { orderId: "ord_001", items: [{ orderItemId: "item_1", actualPrice: "25.00" }] }
    ]);
  });

  it("writes an audit log entry", async () => {
    await service.changeOrderPrices({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户长期合作协议价",
      items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
    });

    expect(auditLogRepository.entries).toEqual([
      { actorId: "user_sales", action: "change_prices", entityType: "order", entityId: "ord_001" }
    ]);
  });

  it("throws StateConflictError once the order is settled", async () => {
    orders.set("ord_001", buildOrder({ status: "settled" }));

    await expect(
      service.changeOrderPrices({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        reason: "客户长期合作协议价",
        items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
      })
    ).rejects.toThrow(StateConflictError);
  });

  it("throws StateConflictError once the order has shipped", async () => {
    orders.set("ord_001", buildOrder({ status: "shipped" }));

    await expect(
      service.changeOrderPrices({
        orderId: "ord_001",
        actor: "sales",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        reason: "客户长期合作协议价",
        items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs price changes through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalOrders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
    const transactionalOrderRepository = new InMemoryOrderRepository(transactionalOrders);
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
            orders: transactionalOrderRepository,
            catalog: new InMemoryCatalogRepository(),
            inventory: new InMemoryInventoryRepository(),
            deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: new InMemoryIdempotencyRepository()
          });
        }
      }
    });

    await transactionalService.changeOrderPrices({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      reason: "客户长期合作协议价",
      items: [{ orderItemId: "item_1", actualPrice: "25.00" }]
    });

    expect(transactionCalls).toBe(1);
    expect(transactionalOrderRepository.priceUpdates).toEqual([
      { orderId: "ord_001", items: [{ orderItemId: "item_1", actualPrice: "25.00" }] }
    ]);
  });
});


