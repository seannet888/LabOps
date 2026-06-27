export class InsufficientInventoryError extends Error {
  constructor(requested: number, available: number) {
    super(`inventory_insufficient: requested ${requested}, available ${available}`);
    this.name = "InsufficientInventoryError";
  }
}

export interface InventoryBatchCandidate {
  id: string;
  birthDate: string;
  availableQty: number;
}

export interface BatchAllocation {
  batchId: string;
  quantity: number;
}

export function recommendShipmentBatches(
  batches: InventoryBatchCandidate[],
  quantityNeeded: number
): BatchAllocation[] {
  const oldestFirst = [...batches].sort((a, b) => a.birthDate.localeCompare(b.birthDate));

  const allocations: BatchAllocation[] = [];
  let remaining = quantityNeeded;

  for (const batch of oldestFirst) {
    if (remaining <= 0) {
      break;
    }
    if (batch.availableQty <= 0) {
      continue;
    }

    const quantity = Math.min(batch.availableQty, remaining);
    allocations.push({ batchId: batch.id, quantity });
    remaining -= quantity;
  }

  if (remaining > 0) {
    const totalAvailable = batches.reduce((sum, batch) => sum + batch.availableQty, 0);
    throw new InsufficientInventoryError(quantityNeeded, totalAvailable);
  }

  return allocations;
}

export function validateBatchDeduction(batch: { availableQty: number }, requestedQty: number): boolean {
  return requestedQty <= batch.availableQty;
}
