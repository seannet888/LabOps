import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, PriceMissingError } from "../errors.js";
import {
  InMemoryAuditLogRepository,
  InMemoryCatalogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import { OrderApplicationService } from "./order-application.service.js";

describe("OrderApplicationService.createOrder", () => {
  let catalog: InMemoryCatalogRepository;
  let service: OrderApplicationService;

  beforeEach(() => {
    catalog = new InMemoryCatalogRepository(new Map([["str_001:5", "28.00"]]));
    service = new OrderApplicationService({
      orders: new InMemoryOrderRepository(new Map()),
      catalog,
      inventory: new InMemoryInventoryRepository(),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("creates a pending order using the current price when actual_price is omitted", async () => {
    const result = await service.createOrder({
      customerId: "cus_001",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      items: [{ strainId: "str_001", ageWeeks: 5, gender: "M", quantity: 20 }]
    });

    expect(result.data.status).toBe("pending");
    expect(result.data.totalAmount).toBe("560.00");
    expect(result.data.orderNumber).toBeTruthy();
  });

  it("uses the sales-provided actual_price when given, without consulting the price list", async () => {
    const result = await service.createOrder({
      customerId: "cus_001",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      items: [{ strainId: "str_999", ageWeeks: 99, gender: "F", quantity: 2, actualPrice: "10.00" }]
    });

    expect(result.data.totalAmount).toBe("20.00");
  });

  it("throws PriceMissingError when no actual_price is given and no current price exists", async () => {
    await expect(
      service.createOrder({
        customerId: "cus_001",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        items: [{ strainId: "str_unknown", ageWeeks: 5, gender: "M", quantity: 1 }]
      })
    ).rejects.toThrow(PriceMissingError);
  });

  it("throws ConflictError when the same idempotency key is reused for a different create order payload", async () => {
    await service.createOrder({
      customerId: "cus_001",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      items: [{ strainId: "str_001", ageWeeks: 5, gender: "M", quantity: 20 }]
    });

    await expect(
      service.createOrder({
        customerId: "cus_002",
        actorId: "user_sales",
        idempotencyKey: "idem_1",
        items: [{ strainId: "str_001", ageWeeks: 5, gender: "M", quantity: 20 }]
      })
    ).rejects.toThrow(ConflictError);
  });

  it("runs order creation through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalCatalog = new InMemoryCatalogRepository(new Map([["str_001:5", "28.00"]]));
    const transactionalOrders = new InMemoryOrderRepository(new Map());
    const transactionalIdempotency = new InMemoryIdempotencyRepository();
    const transactionalService = new OrderApplicationService({
      orders: new InMemoryOrderRepository(new Map()),
      catalog: new InMemoryCatalogRepository(),
      inventory: new InMemoryInventoryRepository(),
      deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
      auditLogs: new InMemoryAuditLogRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: transactionalOrders,
            catalog: transactionalCatalog,
            inventory: new InMemoryInventoryRepository(),
            deliveryTasks: new InMemoryDeliveryTaskRepository(new Map()),
            auditLogs: new InMemoryAuditLogRepository(),
            idempotency: transactionalIdempotency
          });
        }
      }
    });

    const result = await transactionalService.createOrder({
      customerId: "cus_001",
      actorId: "user_sales",
      idempotencyKey: "idem_1",
      items: [{ strainId: "str_001", ageWeeks: 5, gender: "M", quantity: 20 }]
    });

    expect(transactionCalls).toBe(1);
    expect(result.data.totalAmount).toBe("560.00");
  });
});

