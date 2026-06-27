import { canChangeOrderPrice, canTransitionOrderStatus } from "../../domain/order-status.js";
import { idempotencyRequestHash } from "../shared/idempotency.js";
import type { TransactionRunner } from "../shared/transaction-runner.js";
import { InventoryInsufficientError, NotFoundError, PriceMissingError, StateConflictError } from "../errors.js";
import type {
  AuditLogRepository,
  CatalogRepository,
  DeliveryTaskRepository,
  IdempotencyRepository,
  InventoryRepository,
  NewOrderItem,
  Order,
  OrderRepository,
  Page
} from "../shared/types.js";

const CREATE_ORDER_ENDPOINT = "POST /orders";
const CONFIRM_ORDER_ENDPOINT = "POST /orders/{id}/confirm";
const CHANGE_ORDER_PRICES_ENDPOINT = "POST /orders/{id}/change-prices";
const CANCEL_ORDER_ENDPOINT = "POST /orders/{id}/cancel";
const ARCHIVE_DOCUMENTS_ENDPOINT = "POST /orders/{id}/archive-documents";
const SETTLE_ORDER_ENDPOINT = "POST /orders/{id}/settle";

export interface ConfirmOrderInput {
  orderId: string;
  actor: "sales" | "manager";
  actorId: string;
  idempotencyKey: string;
  confirmNote?: string;
}

export interface ConfirmOrderResult {
  data: {
    id: string;
    status: "confirmed";
    deliveryTaskId: string;
  };
  meta: {
    events: string[];
  };
}

export interface ArchiveDocumentsInput {
  orderId: string;
  actor: "sales" | "manager";
  actorId: string;
  idempotencyKey: string;
  note?: string;
}

export interface ArchiveDocumentsResult {
  data: {
    id: string;
    status: "invoiced";
  };
}

export interface SettleOrderInput {
  orderId: string;
  actor: "sales" | "manager";
  actorId: string;
  idempotencyKey: string;
  settledAt?: string;
  paymentMethod?: string;
  note?: string;
}

export interface SettleOrderResult {
  data: {
    id: string;
    status: "settled";
  };
}

export interface CreateOrderItemInput {
  strainId: string;
  ageWeeks: number;
  gender: "M" | "F";
  quantity: number;
  actualPrice?: string;
}

export interface CreateOrderInput {
  actorId: string;
  idempotencyKey: string;
  customerId: string;
  deliveryMethod?: string;
  plannedDeliveryDate?: string;
  requiresInvoice?: boolean;
  invoiceType?: string;
  notes?: string;
  items: CreateOrderItemInput[];
}

export interface CreateOrderResult {
  data: {
    id: string;
    orderNumber: string;
    status: "pending";
    totalAmount: string;
  };
}

export interface ChangeOrderPricesItemInput {
  orderItemId: string;
  actualPrice: string;
}

export interface ChangeOrderPricesInput {
  orderId: string;
  actor: "sales" | "manager";
  actorId: string;
  idempotencyKey: string;
  reason: string;
  items: ChangeOrderPricesItemInput[];
}

export interface ChangeOrderPricesResult {
  data: {
    id: string;
  };
}

export interface CancelOrderInput {
  orderId: string;
  actor: "sales" | "manager";
  actorId: string;
  idempotencyKey: string;
  reason: string;
}

export interface CancelOrderResult {
  data: {
    id: string;
    status: "cancelled";
  };
}

export interface OrderApplicationTransactionContext {
  orders: OrderRepository;
  inventory: InventoryRepository;
  catalog: CatalogRepository;
  deliveryTasks: DeliveryTaskRepository;
  auditLogs: AuditLogRepository;
  idempotency: IdempotencyRepository;
}

export interface OrderApplicationServiceDependencies extends OrderApplicationTransactionContext {
  transactions?: TransactionRunner<OrderApplicationTransactionContext>;
}

export class OrderApplicationService {
  constructor(private readonly deps: OrderApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: OrderApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async confirmOrder(input: ConfirmOrderInput): Promise<ConfirmOrderResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ConfirmOrderResult>(
        input.actorId,
        CONFIRM_ORDER_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const order = await deps.orders.findById(input.orderId);
      if (!order || !canTransitionOrderStatus(order.status, "confirmed", input.actor)) {
        throw new StateConflictError();
      }

      for (const item of order.items) {
        const available = await deps.inventory.getAvailableQty(item.strainId, item.ageWeeks, item.gender);
        if (available < item.quantity) {
          throw new InventoryInsufficientError();
        }
      }

      for (const item of order.items) {
        await deps.inventory.reserve({
          orderItemId: item.id,
          strainId: item.strainId,
          ageWeeks: item.ageWeeks,
          gender: item.gender,
          quantity: item.quantity
        });
      }

      await deps.orders.markConfirmed(input.orderId);
      const deliveryTask = await deps.deliveryTasks.createForOrder(input.orderId);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "confirm_order",
        entityType: "order",
        entityId: input.orderId,
        newValue: input.confirmNote ? { confirmNote: input.confirmNote } : undefined
      });

      const result: ConfirmOrderResult = {
        data: { id: input.orderId, status: "confirmed", deliveryTaskId: deliveryTask.id },
        meta: { events: ["order_confirmed", "inventory_reserved", "delivery_task_created"] }
      };

      await deps.idempotency.saveResult(input.actorId, CONFIRM_ORDER_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async archiveDocuments(input: ArchiveDocumentsInput): Promise<ArchiveDocumentsResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ArchiveDocumentsResult>(
        input.actorId,
        ARCHIVE_DOCUMENTS_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const order = await deps.orders.findById(input.orderId);
      if (!order || !canTransitionOrderStatus(order.status, "invoiced", input.actor)) {
        throw new StateConflictError();
      }

      await deps.orders.markInvoiced(input.orderId);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "archive_documents",
        entityType: "order",
        entityId: input.orderId
      });

      const result: ArchiveDocumentsResult = { data: { id: input.orderId, status: "invoiced" } };

      await deps.idempotency.saveResult(input.actorId, ARCHIVE_DOCUMENTS_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async settleOrder(input: SettleOrderInput): Promise<SettleOrderResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<SettleOrderResult>(
        input.actorId,
        SETTLE_ORDER_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const order = await deps.orders.findById(input.orderId);
      if (!order || !canTransitionOrderStatus(order.status, "settled", input.actor)) {
        throw new StateConflictError();
      }

      await deps.orders.markSettled(input.orderId);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "settle",
        entityType: "order",
        entityId: input.orderId
      });

      const result: SettleOrderResult = { data: { id: input.orderId, status: "settled" } };

      await deps.idempotency.saveResult(input.actorId, SETTLE_ORDER_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<CreateOrderResult>(
        input.actorId,
        CREATE_ORDER_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const pricedItems: NewOrderItem[] = [];

      for (const item of input.items) {
        let actualPrice = item.actualPrice;
        if (!actualPrice) {
          const currentPrice = await deps.catalog.getCurrentPrice(item.strainId, item.ageWeeks);
          if (!currentPrice) {
            throw new PriceMissingError();
          }
          actualPrice = currentPrice;
        }
        pricedItems.push({
          strainId: item.strainId,
          ageWeeks: item.ageWeeks,
          gender: item.gender,
          quantity: item.quantity,
          actualPrice: actualPrice as string
        });
      }

      const order = await deps.orders.create({
        customerId: input.customerId,
        salesRepId: input.actorId,
        deliveryMethod: input.deliveryMethod,
        plannedDeliveryDate: input.plannedDeliveryDate,
        invoiceRequired: input.requiresInvoice ?? false,
        invoiceType: input.invoiceType,
        notes: input.notes,
        items: pricedItems
      });

      const result: CreateOrderResult = {
        data: {
          id: order.id,
          orderNumber: order.orderNumber ?? order.id,
          status: "pending",
          totalAmount: order.totalAmount ?? "0.00"
        }
      };

      await deps.idempotency.saveResult(input.actorId, CREATE_ORDER_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async changeOrderPrices(input: ChangeOrderPricesInput): Promise<ChangeOrderPricesResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<ChangeOrderPricesResult>(
        input.actorId,
        CHANGE_ORDER_PRICES_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const order = await deps.orders.findById(input.orderId);
      if (!order || !canChangeOrderPrice(order.status)) {
        throw new StateConflictError();
      }

      await deps.orders.updateItemPrices(input.orderId, input.items);

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "change_prices",
        entityType: "order",
        entityId: input.orderId
      });

      const result: ChangeOrderPricesResult = { data: { id: input.orderId } };

      await deps.idempotency.saveResult(input.actorId, CHANGE_ORDER_PRICES_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async cancelOrder(input: CancelOrderInput): Promise<CancelOrderResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<CancelOrderResult>(
        input.actorId,
        CANCEL_ORDER_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const order = await deps.orders.findById(input.orderId);
      if (!order || !canTransitionOrderStatus(order.status, "cancelled", input.actor)) {
        throw new StateConflictError();
      }

      if (order.status === "confirmed") {
        for (const item of order.items) {
          await deps.inventory.releaseAllocations(item.id);
        }
      }

      await deps.orders.markCancelled(input.orderId);

      const deliveryTask = await deps.deliveryTasks.findByOrderId(input.orderId);
      if (deliveryTask && deliveryTask.status !== "shipped" && deliveryTask.status !== "delivered") {
        await deps.deliveryTasks.markCancelled(deliveryTask.id);
      }

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "cancel",
        entityType: "order",
        entityId: input.orderId
      });

      const result: CancelOrderResult = { data: { id: input.orderId, status: "cancelled" } };

      await deps.idempotency.saveResult(input.actorId, CANCEL_ORDER_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
  async listOrders(filters: {
    customerId?: string;
    status?: Order["status"];
    page: number;
    limit: number;
  }): Promise<Page<Order>> {
    return this.deps.orders.list(filters);
  }

  async getOrder(orderId: string): Promise<{ data: Order }> {
    const order = await this.deps.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError("订单不存在");
    }
    return { data: order };
  }
}



