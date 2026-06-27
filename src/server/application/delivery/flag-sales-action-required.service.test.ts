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

describe("DeliveryApplicationService.flagSalesActionRequired", () => {
  let tasks: Map<string, DeliveryTask>;
  let deliveryTaskRepository: InMemoryDeliveryTaskRepository;
  let auditLogs: InMemoryAuditLogRepository;
  let service: DeliveryApplicationService;

  beforeEach(() => {
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]]);
    deliveryTaskRepository = new InMemoryDeliveryTaskRepository(tasks);
    auditLogs = new InMemoryAuditLogRepository();
    service = new DeliveryApplicationService({
      orders: new InMemoryOrderRepository(new Map([["ord_001", buildOrder()]])),
      deliveryTasks: deliveryTaskRepository,
      inventory: new InMemoryInventoryRepository(),
      documents: new InMemoryDocumentRepository(),
      auditLogs,
      idempotency: new InMemoryIdempotencyRepository()
    });
  });

  it("flags the task before shipment", async () => {
    const result = await service.flagSalesActionRequired({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      reason: "送货地址缺少楼号，请销售确认"
    });

    expect(result.data.id).toBe("dt_001");
    expect(tasks.get("dt_001")?.salesActionRequired).toBe(true);
    expect(tasks.get("dt_001")?.salesActionNote).toBe("送货地址缺少楼号，请销售确认");
    expect(auditLogs.entries).toEqual([
      {
        actorId: "user_logistics",
        action: "flag_sales_action",
        entityType: "delivery_task",
        entityId: "dt_001",
        reason: "送货地址缺少楼号，请销售确认"
      }
    ]);
  });

  it("throws StateConflictError once the task has shipped", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "shipped" }));

    await expect(
      service.flagSalesActionRequired({
        deliveryTaskId: "dt_001",
        actorId: "user_logistics",
        idempotencyKey: "idem_1",
        reason: "送货地址缺少楼号，请销售确认"
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs sales-action flagging through the transaction runner with transaction-scoped repositories", async () => {
    let transactionCalls = 0;
    const transactionalTasks = new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]]);
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

    await transactionalService.flagSalesActionRequired({
      deliveryTaskId: "dt_001",
      actorId: "user_logistics",
      idempotencyKey: "idem_1",
      reason: "送货地址缺少楼号，请销售确认"
    });

    expect(transactionCalls).toBe(1);
    expect(transactionalTasks.get("dt_001")?.salesActionRequired).toBe(true);
  });
});

