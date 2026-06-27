import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, DocumentReleaseReasonRequiredError, ShipmentBatchRequiredError, StateConflictError } from "../errors.js";
import {
  buildDeliveryTask,
  buildInventoryBatch,
  buildOrder,
  InMemoryAuditLogRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryDocumentRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository
} from "../shared/test-fixtures.js";
import type { DeliveryTask, InventoryBatch, Order } from "../shared/types.js";
import { DeliveryApplicationService } from "./delivery-application.service.js";

describe("DeliveryApplicationService.confirmShipment", () => {
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let batches: Map<string, InventoryBatch>;
  let orderRepository: InMemoryOrderRepository;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let inventoryRepository: InMemoryInventoryRepository;
  let documentRepository: InMemoryDocumentRepository;
  let auditLogRepository: InMemoryAuditLogRepository;
  let idempotencyRepository: InMemoryIdempotencyRepository;
  let service: DeliveryApplicationService;

  beforeEach(() => {
    orders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]]);
    batches = new Map([["batch_001", buildInventoryBatch()]]);
    orderRepository = new InMemoryOrderRepository(orders);
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    inventoryRepository = new InMemoryInventoryRepository(new Map(), batches);
    documentRepository = new InMemoryDocumentRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
    idempotencyRepository = new InMemoryIdempotencyRepository();
    service = new DeliveryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory: inventoryRepository,
      documents: documentRepository,
      auditLogs: auditLogRepository,
      idempotency: idempotencyRepository
    });
  });

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      stockDeductions: [{ orderItemId: "item_1", inventoryBatchId: "batch_001", quantity: 10 }],
      ...overrides
    };
  }

  it("confirms shipment, records stock deductions, finalizes allocations, and syncs order status", async () => {
    const result = await service.confirmShipment(baseInput());

    expect(result.data).toEqual({ id: "dt_001", status: "shipped", orderId: "ord_001", orderStatus: "shipped" });
    expect(result.meta.events).toEqual(["shipment_confirmed", "inventory_deducted", "order_shipped"]);
    expect(inventoryRepository.deductions).toEqual([
      { deliveryTaskId: "dt_001", orderItemId: "item_1", inventoryBatchId: "batch_001", quantity: 10, confirmedBy: "user_logistics" }
    ]);
    expect(inventoryRepository.finalizedAllocations).toEqual(["item_1"]);
  });

  it("writes an audit log entry", async () => {
    await service.confirmShipment(baseInput());

    expect(auditLogRepository.entries).toEqual([
      { actorId: "user_logistics", action: "confirm_shipment", entityType: "delivery_task", entityId: "dt_001" }
    ]);
  });

  it("records the document release reason when certificates are missing with a reason", async () => {
    await service.confirmShipment(
      baseInput({
        documentRelease: { missingCertificate: true, missingInvoice: false, reason: "合格证已随货纸质交付，扫描件下午补传" }
      })
    );

    expect(documentRepository.releaseReasons).toEqual([
      {
        deliveryTaskId: "dt_001",
        orderId: "ord_001",
        missingCertificate: true,
        missingInvoice: false,
        reason: "合格证已随货纸质交付，扫描件下午补传",
        releasedBy: "user_logistics"
      }
    ]);
  });

  it("throws ShipmentBatchRequiredError when no stock deductions are provided", async () => {
    await expect(service.confirmShipment(baseInput({ stockDeductions: [] }))).rejects.toThrow(
      ShipmentBatchRequiredError
    );
  });

  it("throws DocumentReleaseReasonRequiredError when a certificate is missing without a reason", async () => {
    await expect(
      service.confirmShipment(baseInput({ documentRelease: { missingCertificate: true, missingInvoice: false } }))
    ).rejects.toThrow(DocumentReleaseReasonRequiredError);
  });

  it("throws StateConflictError when the delivery task is not in a shippable state", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "pending_schedule" }));

    await expect(service.confirmShipment(baseInput())).rejects.toThrow(StateConflictError);
  });

  it("returns the original result on a duplicate idempotency key without recording stock deductions twice", async () => {
    const first = await service.confirmShipment(baseInput());

    tasks.set("dt_001", buildDeliveryTask({ status: "shipped" }));

    const second = await service.confirmShipment(baseInput());

    expect(second).toEqual(first);
    expect(inventoryRepository.deductions).toHaveLength(1);
    expect(inventoryRepository.finalizedAllocations).toEqual(["item_1"]);
  });

  it("throws ConflictError when the same idempotency key is reused for a different shipment payload", async () => {
    await service.confirmShipment(baseInput());

    tasks.set("dt_002", buildDeliveryTask({ id: "dt_002", orderId: "ord_001", status: "scheduled" }));
    batches.set("batch_002", buildInventoryBatch({ id: "batch_002", availableQty: 10 }));

    await expect(
      service.confirmShipment(
        baseInput({
          deliveryTaskId: "dt_002",
          stockDeductions: [{ orderItemId: "item_1", inventoryBatchId: "batch_002", quantity: 10 }]
        })
      )
    ).rejects.toThrow(ConflictError);
  });


  it("runs shipment writes through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    let outerFinalizeCalls = 0;
    let transactionalFinalizeCalls = 0;
    const transactionalBatches = new Map([["batch_001", buildInventoryBatch()]]);
    const transactionalInventory = new InMemoryInventoryRepository(new Map(), transactionalBatches);
    const originalTransactionalFinalize = transactionalInventory.finalizeAllocations.bind(transactionalInventory);
    transactionalInventory.finalizeAllocations = async (...args) => {
      transactionalFinalizeCalls += 1;
      return originalTransactionalFinalize(...args);
    };
    const originalOuterFinalize = inventoryRepository.finalizeAllocations.bind(inventoryRepository);
    inventoryRepository.finalizeAllocations = async (...args) => {
      outerFinalizeCalls += 1;
      return originalOuterFinalize(...args);
    };

    service = new DeliveryApplicationService({
      orders: orderRepository,
      deliveryTasks: deliveryTaskRepository,
      inventory: inventoryRepository,
      documents: documentRepository,
      auditLogs: auditLogRepository,
      idempotency: idempotencyRepository,
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({
            orders: orderRepository,
            deliveryTasks: deliveryTaskRepository,
            inventory: transactionalInventory,
            documents: documentRepository,
            auditLogs: auditLogRepository,
            idempotency: idempotencyRepository
          });
        }
      }
    });

    await service.confirmShipment(baseInput());

    expect(transactionCalls).toBe(1);
    expect(outerFinalizeCalls).toBe(0);
    expect(transactionalFinalizeCalls).toBe(1);
  });
});
