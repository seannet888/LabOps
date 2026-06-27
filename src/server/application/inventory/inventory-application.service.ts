import { InsufficientInventoryError, recommendShipmentBatches } from "../../domain/inventory-policy.js";
import { idempotencyRequestHash } from "../shared/idempotency.js";
import { InventoryInsufficientError, StateConflictError } from "../errors.js";
import type { TransactionRunner } from "../shared/transaction-runner.js";
import type {
  AuditLogRepository,
  DeliveryTaskRepository,
  IdempotencyRepository,
  InventoryBatch,
  InventoryRepository,
  NewInventoryBatch,
  OrderRepository,
  Page
} from "../shared/types.js";

export interface ShipmentSuggestion {
  orderItemId: string;
  requiredQty: number;
  suggestedBatches: { inventoryBatchId: string; quantity: number; reason: string }[];
}

export interface GetShipmentSuggestionsResult {
  data: ShipmentSuggestion[];
}

export interface CreateBatchInput extends NewInventoryBatch {
  actorId: string;
  idempotencyKey: string;
}

export interface CreateBatchResult {
  data: {
    id: string;
  };
}

export interface InventoryApplicationTransactionContext {
  orders: OrderRepository;
  deliveryTasks: DeliveryTaskRepository;
  inventory: InventoryRepository;
  auditLogs: AuditLogRepository;
  idempotency: IdempotencyRepository;
}

export interface InventoryApplicationServiceDependencies extends InventoryApplicationTransactionContext {
  transactions?: TransactionRunner<InventoryApplicationTransactionContext>;
}

const AGING_FIFO_REASON = "优先老化/先进先出";
const CREATE_BATCH_ENDPOINT = "POST /inventory-batches";

export class InventoryApplicationService {
  constructor(private readonly deps: InventoryApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: InventoryApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async getShipmentSuggestions(deliveryTaskId: string): Promise<GetShipmentSuggestionsResult> {
    const task = await this.deps.deliveryTasks.findById(deliveryTaskId);
    if (!task) {
      throw new StateConflictError();
    }

    const order = await this.deps.orders.findById(task.orderId);
    if (!order) {
      throw new StateConflictError();
    }

    const data: ShipmentSuggestion[] = [];

    for (const item of order.items) {
      const batches = await this.deps.inventory.listBatchesForItem(item.strainId, item.ageWeeks, item.gender);

      let allocations;
      try {
        allocations = recommendShipmentBatches(batches, item.quantity);
      } catch (error) {
        if (error instanceof InsufficientInventoryError) {
          throw new InventoryInsufficientError();
        }
        throw error;
      }

      data.push({
        orderItemId: item.id,
        requiredQty: item.quantity,
        suggestedBatches: allocations.map((allocation) => ({
          inventoryBatchId: allocation.batchId,
          quantity: allocation.quantity,
          reason: AGING_FIFO_REASON
        }))
      });
    }

    return { data };
  }

  async createBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<CreateBatchResult>(
        input.actorId,
        CREATE_BATCH_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const batch = await deps.inventory.createBatch({
        strainId: input.strainId,
        birthDate: input.birthDate,
        gender: input.gender,
        initialQty: input.initialQty,
        entryDate: input.entryDate,
        notes: input.notes
      });

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "create_batch",
        entityType: "inventory_batch",
        entityId: batch.id
      });

      const result: CreateBatchResult = { data: { id: batch.id } };
      await deps.idempotency.saveResult(input.actorId, CREATE_BATCH_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }

  async listBatches(filters: {
    strainId?: string;
    gender?: "M" | "F";
    page: number;
    limit: number;
  }): Promise<Page<InventoryBatch>> {
    return this.deps.inventory.listBatches(filters);
  }

  async getAvailability(filters: {
    strainId: string;
    ageWeeks: number;
    gender: "M" | "F";
  }): Promise<{ data: { availableQty: number; reservedQty: number; agingQty: number } }> {
    return { data: await this.deps.inventory.getAvailabilitySummary(filters) };
  }
}
