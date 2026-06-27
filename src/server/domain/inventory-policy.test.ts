import { describe, expect, it } from "vitest";
import { InsufficientInventoryError, recommendShipmentBatches, validateBatchDeduction } from "./inventory-policy.js";

describe("recommendShipmentBatches", () => {
  it("prioritizes the oldest batch first (aging/FIFO)", () => {
    const batches = [
      { id: "batch_new", birthDate: "2026-06-01", availableQty: 10 },
      { id: "batch_old", birthDate: "2026-05-01", availableQty: 10 }
    ];

    const result = recommendShipmentBatches(batches, 5);

    expect(result).toEqual([{ batchId: "batch_old", quantity: 5 }]);
  });

  it("spans multiple batches oldest-first when one batch is not enough", () => {
    const batches = [
      { id: "batch_new", birthDate: "2026-06-01", availableQty: 10 },
      { id: "batch_old", birthDate: "2026-05-01", availableQty: 3 }
    ];

    const result = recommendShipmentBatches(batches, 5);

    expect(result).toEqual([
      { batchId: "batch_old", quantity: 3 },
      { batchId: "batch_new", quantity: 2 }
    ]);
  });

  it("throws InsufficientInventoryError when total available is too low", () => {
    const batches = [{ id: "batch_old", birthDate: "2026-05-01", availableQty: 2 }];

    expect(() => recommendShipmentBatches(batches, 5)).toThrow(InsufficientInventoryError);
  });
});

describe("validateBatchDeduction", () => {
  it("allows deducting up to the available quantity", () => {
    expect(validateBatchDeduction({ availableQty: 5 }, 5)).toBe(true);
  });

  it("rejects deducting more than the available quantity", () => {
    expect(validateBatchDeduction({ availableQty: 5 }, 6)).toBe(false);
  });
});
