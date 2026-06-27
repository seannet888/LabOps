import { canFlagSalesActionRequired, canTransitionDeliveryTaskStatus } from "../../domain/delivery-status.js";
import { evaluateDocumentRelease } from "../../domain/document-policy.js";
import { validateBatchDeduction } from "../../domain/inventory-policy.js";
import { canTransitionOrderStatus } from "../../domain/order-status.js";
import { idempotencyRequestHash } from "../shared/idempotency.js";
import type { TransactionRunner } from "../shared/transaction-runner.js";
import { DocumentReleaseReasonRequiredError, NotFoundError, ShipmentBatchRequiredError, StateConflictError } from "../errors.js";
import type {
  AuditLogRepository,
  DeliveryTask,
  DeliveryTaskRepository,
  DocumentRepository,
  IdempotencyRepository,
  InventoryRepository,
  OrderRepository,
  Page
} from "../shared/types.js";

const CONFIRM_SHIPMENT_ENDPOINT = "POST /delivery-tasks/{id}/confirm-shipment";
const CONFIRM_DELIVERY_ENDPOINT = "POST /delivery-tasks/{id}/confirm-delivery";
const SCHEDULE_DELIVERY_TASK_ENDPOINT = "POST /delivery-tasks/{id}/schedule";
const FLAG_SALES_ACTION_REQUIRED_ENDPOINT = "POST /delivery-tasks/{id}/flag-sales-action-required";

export interface ConfirmShipmentStockDeduction {
  orderItemId: string;
  inventoryBatchId: string;
  quantity: number;
}

export interface ConfirmShipmentDocumentRelease {
  missingCertificate: boolean;
  missingInvoice: boolean;
  reason?: string;
}

export interface ConfirmShipmentInput {
  deliveryTaskId: string;
  actorId: string;
  idempotencyKey: string;
  stockDeductions: ConfirmShipmentStockDeduction[];
  documentRelease?: ConfirmShipmentDocumentRelease;
}

export interface ConfirmShipmentResult {
  data: {
    id: string;
    status: "shipped";
    orderId: string;
    orderStatus: "shipped";
  };
  meta: {
    events: string[];
  };
}

export interface ConfirmDeliveryInput {
  deliveryTaskId: string;
  actorId: string;
  idempotencyKey: string;
  deliveredAt?: string;
  note?: string;
}

export interface ConfirmDeliveryResult {
  data: {
    id: string;
    status: "delivered";
    orderId: string;
    orderStatus: "delivered";
  };
}

export interface ScheduleDeliveryTaskInput {
  deliveryTaskId: string;
  actorId: string;
  idempotencyKey: string;
  plannedDeliveryDate: string;
  vehicle?: string;
  driver?: string;
  deliveryBatch?: string;
  routeNotes?: string;
}

export interface ScheduleDeliveryTaskResult {
  data: {
    id: string;
    status: "scheduled";
  };
}

export interface FlagSalesActionRequiredInput {
  deliveryTaskId: string;
  actorId: string;
  idempotencyKey: string;
  reason: string;
}

export interface FlagSalesActionRequiredResult {
  data: {
    id: string;
  };
}

export interface DeliveryApplicationTransactionContext {
  orders: OrderRepository;
  deliveryTasks: DeliveryTaskRepository;
  inventory: InventoryRepository;
  documents: DocumentRepository;
  auditLogs: AuditLogRepository;
  idempotency: IdempotencyRepository;
}

export interface DeliveryApplicationServiceDependencies extends DeliveryApplicationTransactionContext {
  transactions?: TransactionRunner<DeliveryApplicationTransactionContext>;
}

export class DeliveryApplicationService {
  constructor(private readonly deps: DeliveryApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: DeliveryApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async confirmShipment(input: ConfirmShipmentInput): Promise<ConfirmShipmentResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ConfirmShipmentResult>(
        input.actorId,
        CONFIRM_SHIPMENT_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const task = await deps.deliveryTasks.findById(input.deliveryTaskId);
      if (!task || !canTransitionDeliveryTaskStatus(task.status, "shipped")) {
        throw new StateConflictError();
      }

      const order = await deps.orders.findById(task.orderId);
      if (!order) {
        throw new StateConflictError();
      }

      if (input.stockDeductions.length === 0) {
        throw new ShipmentBatchRequiredError();
      }

      for (const deduction of input.stockDeductions) {
        const batch = await deps.inventory.getBatch(deduction.inventoryBatchId);
        if (!batch || !validateBatchDeduction(batch, deduction.quantity)) {
          throw new ShipmentBatchRequiredError();
        }
      }

      const documentRelease = input.documentRelease;
      const releaseCheck = evaluateDocumentRelease({
        certificateMissing: documentRelease?.missingCertificate ?? false,
        certificateMissingReason: documentRelease?.reason,
        invoiceRequired: order.invoiceRequired,
        invoiceMissing: documentRelease?.missingInvoice ?? false,
        invoiceMissingReason: documentRelease?.reason
      });
      if (!releaseCheck.allowed) {
        throw new DocumentReleaseReasonRequiredError();
      }

      for (const deduction of input.stockDeductions) {
        await deps.inventory.recordStockDeduction({
          deliveryTaskId: input.deliveryTaskId,
          orderItemId: deduction.orderItemId,
          inventoryBatchId: deduction.inventoryBatchId,
          quantity: deduction.quantity,
          confirmedBy: input.actorId
        });
        await deps.inventory.finalizeAllocations(deduction.orderItemId);
      }

      if (releaseCheck.requiresAudit && documentRelease) {
        await deps.documents.recordReleaseReason({
          deliveryTaskId: input.deliveryTaskId,
          orderId: task.orderId,
          missingCertificate: documentRelease.missingCertificate,
          missingInvoice: documentRelease.missingInvoice,
          reason: documentRelease.reason ?? "",
          releasedBy: input.actorId
        });
      }

      await deps.deliveryTasks.markShipped(input.deliveryTaskId);
      await deps.orders.markShipped(task.orderId);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "confirm_shipment",
        entityType: "delivery_task",
        entityId: input.deliveryTaskId
      });

      const result: ConfirmShipmentResult = {
        data: { id: input.deliveryTaskId, status: "shipped", orderId: task.orderId, orderStatus: "shipped" },
        meta: { events: ["shipment_confirmed", "inventory_deducted", "order_shipped"] }
      };

      await deps.idempotency.saveResult(input.actorId, CONFIRM_SHIPMENT_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async confirmDelivery(input: ConfirmDeliveryInput): Promise<ConfirmDeliveryResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ConfirmDeliveryResult>(
        input.actorId,
        CONFIRM_DELIVERY_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const task = await deps.deliveryTasks.findById(input.deliveryTaskId);
      if (!task || !canTransitionDeliveryTaskStatus(task.status, "delivered")) {
        throw new StateConflictError();
      }

      const order = await deps.orders.findById(task.orderId);
      if (!order || !canTransitionOrderStatus(order.status, "delivered", "delivery_sync")) {
        throw new StateConflictError();
      }

      await deps.deliveryTasks.markDelivered(input.deliveryTaskId, input.deliveredAt);
      await deps.orders.markDelivered(task.orderId);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "confirm_delivery",
        entityType: "delivery_task",
        entityId: input.deliveryTaskId,
        newValue: input.deliveredAt || input.note ? { deliveredAt: input.deliveredAt, note: input.note } : undefined
      });

      const result: ConfirmDeliveryResult = {
        data: { id: input.deliveryTaskId, status: "delivered", orderId: task.orderId, orderStatus: "delivered" }
      };

      await deps.idempotency.saveResult(input.actorId, CONFIRM_DELIVERY_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }

  async scheduleDeliveryTask(input: ScheduleDeliveryTaskInput): Promise<ScheduleDeliveryTaskResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ScheduleDeliveryTaskResult>(
        input.actorId,
        SCHEDULE_DELIVERY_TASK_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const task = await deps.deliveryTasks.findById(input.deliveryTaskId);
      if (!task || !canTransitionDeliveryTaskStatus(task.status, "scheduled")) {
        throw new StateConflictError();
      }

      await deps.deliveryTasks.markScheduled(input.deliveryTaskId, {
        plannedDeliveryDate: input.plannedDeliveryDate,
        vehicle: input.vehicle,
        driver: input.driver,
        deliveryBatch: input.deliveryBatch,
        routeNotes: input.routeNotes
      });

      const result: ScheduleDeliveryTaskResult = { data: { id: input.deliveryTaskId, status: "scheduled" } };

      await deps.idempotency.saveResult(input.actorId, SCHEDULE_DELIVERY_TASK_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async flagSalesActionRequired(input: FlagSalesActionRequiredInput): Promise<FlagSalesActionRequiredResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<FlagSalesActionRequiredResult>(
        input.actorId,
        FLAG_SALES_ACTION_REQUIRED_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const task = await deps.deliveryTasks.findById(input.deliveryTaskId);
      if (!task || !canFlagSalesActionRequired(task.status)) {
        throw new StateConflictError();
      }

      await deps.deliveryTasks.flagSalesActionRequired(input.deliveryTaskId, input.reason);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "flag_sales_action",
        entityType: "delivery_task",
        entityId: input.deliveryTaskId,
        reason: input.reason
      });

      const result: FlagSalesActionRequiredResult = { data: { id: input.deliveryTaskId } };

      await deps.idempotency.saveResult(
        input.actorId,
        FLAG_SALES_ACTION_REQUIRED_ENDPOINT,
        input.idempotencyKey,
        result,
        requestHash
      );

      return result;
    });
  }
  async listDeliveryTasks(filters: {
    status?: DeliveryTask["status"];
    plannedDeliveryDate?: string;
    geoArea?: string;
    page: number;
    limit: number;
  }): Promise<Page<DeliveryTask>> {
    return this.deps.deliveryTasks.list(filters);
  }

  async getDeliveryTask(taskId: string): Promise<{ data: DeliveryTask }> {
    const task = await this.deps.deliveryTasks.findById(taskId);
    if (!task) {
      throw new NotFoundError("配送任务不存在");
    }
    return { data: task };
  }
}

