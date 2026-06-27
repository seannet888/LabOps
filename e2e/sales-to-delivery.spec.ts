import { beforeEach, describe, expect, it } from "vitest";
import { canTransitionOrderStatus } from "../src/server/domain/order-status.js";
import { DeliveryApplicationService } from "../src/server/application/delivery/delivery-application.service.js";
import { OrderApplicationService } from "../src/server/application/orders/order-application.service.js";
import {
  buildInventoryBatch,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryCatalogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryDocumentRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../src/server/application/shared/test-fixtures.js";
import type { DeliveryTask, Order } from "../src/server/application/shared/types.js";

/**
 * Exercises the sales-to-delivery happy path through the application services directly,
 * since the HTTP route layer doesn't exist yet (AGENTS.md §13 step Phase 3). Auth/session
 * design is decided (ADR-0007) and AuthApplicationService exists, but nothing wires it to
 * an HTTP request yet, so this spec still calls services directly rather than through routes.
 *
 * Route-level 403 rejection ("sales cannot confirm shipment", "logistics cannot edit price")
 * is a Route Adapter responsibility per backend-blueprint.md §9 and can't be exercised until
 * that layer is built. The underlying domain rule these checks would rely on is already
 * covered at the policy level in src/server/domain/order-status.test.ts (e.g. "does not allow
 * sales to push shipped to delivered"); this spec re-asserts that same rule once more, applied
 * to the state actually reached by this flow, as the closest equivalent available today.
 */
describe("sales-to-delivery flow", () => {
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let inventory: InMemoryInventoryRepository;
  let orderService: OrderApplicationService;
  let deliveryService: DeliveryApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder()]]);
    tasks = new Map();
    inventory = new InMemoryInventoryRepository(
      new Map([["strain_c57:4:M", 20]]),
      new Map([["batch_001", buildInventoryBatch()]])
    );

    const orderRepository = new InMemoryOrderRepository(orders);
    const deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    const auditLogs = new InMemoryAuditLogRepository();
    const idempotency = new InMemoryIdempotencyRepository();

    orderService = new OrderApplicationService({
      orders: orderRepository,
      catalog: new InMemoryCatalogRepository(),
      inventory,
      deliveryTasks: deliveryTaskRepository,
      auditLogs,
      idempotency
    });

    deliveryService = new DeliveryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory,
      documents: new InMemoryDocumentRepository(),
      auditLogs,
      idempotency
    });
  });

  it("runs the full sales-confirm -> logistics-ship -> logistics-deliver -> sales-settle flow", async () => {
    const confirmResult = await orderService.confirmOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_confirm"
    });
    expect(orders.get("ord_001")?.status).toBe("confirmed");
    expect(tasks.get(confirmResult.data.deliveryTaskId)?.status).toBe("pending_schedule");

    const taskId = confirmResult.data.deliveryTaskId;

    const scheduleResult = await deliveryService.scheduleDeliveryTask({
      deliveryTaskId: taskId,
      actorId: "user_logistics",
      idempotencyKey: "idem_schedule",
      plannedDeliveryDate: "2026-06-27",
      vehicle: "京A12345",
      driver: "王师傅"
    });
    expect(scheduleResult.data.status).toBe("scheduled");
    expect(tasks.get(taskId)?.status).toBe("scheduled");

    const shipmentResult = await deliveryService.confirmShipment({
      deliveryTaskId: taskId,
      actorId: "user_logistics",
      idempotencyKey: "idem_ship",
      stockDeductions: [{ orderItemId: "item_1", inventoryBatchId: "batch_001", quantity: 10 }],
      documentRelease: { missingCertificate: false, missingInvoice: false }
    });
    expect(shipmentResult.data.status).toBe("shipped");
    expect(orders.get("ord_001")?.status).toBe("shipped");

    const deliveryResult = await deliveryService.confirmDelivery({
      deliveryTaskId: taskId,
      actorId: "user_logistics",
      idempotencyKey: "idem_deliver"
    });
    expect(deliveryResult.data.status).toBe("delivered");
    expect(orders.get("ord_001")?.status).toBe("delivered");

    const archiveResult = await orderService.archiveDocuments({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_archive",
      note: "合格证扫描件和发票信息已归档"
    });
    expect(archiveResult.data.status).toBe("invoiced");

    const settleResult = await orderService.settleOrder({
      orderId: "ord_001",
      actor: "sales",
      actorId: "user_sales",
      idempotencyKey: "idem_settle",
      paymentMethod: "bank_transfer"
    });
    expect(settleResult.data.status).toBe("settled");
    expect(orders.get("ord_001")?.status).toBe("settled");
  });

  it("forbids sales from pushing a confirmed order straight to shipped (logistics-only transition)", () => {
    expect(canTransitionOrderStatus("confirmed", "shipped", "sales")).toBe(false);
  });

  it("forbids sales from pushing a shipped order straight to delivered (logistics-only transition)", () => {
    expect(canTransitionOrderStatus("shipped", "delivered", "sales")).toBe(false);
  });
});
