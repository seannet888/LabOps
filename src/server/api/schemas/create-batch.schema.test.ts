import { describe, expect, it } from "vitest";
import { createBatchSchema } from "./create-batch.schema.js";

const validBatch = (overrides: Record<string, unknown> = {}) => ({
  strain_id: "str_001",
  birth_date: "2026-05-21",
  gender: "M",
  initial_qty: 100,
  entry_date: "2026-05-22",
  notes: "A架",
  ...overrides
});

describe("createBatchSchema", () => {
  it("accepts a valid inventory batch payload", () => {
    expect(createBatchSchema.safeParse(validBatch()).success).toBe(true);
  });

  it("rejects invalid quantity, dates, gender, and unknown fields", () => {
    expect(createBatchSchema.safeParse(validBatch({ initial_qty: -1 })).success).toBe(false);
    expect(createBatchSchema.safeParse(validBatch({ initial_qty: 1.5 })).success).toBe(false);
    expect(createBatchSchema.safeParse(validBatch({ birth_date: "2026/05/21" })).success).toBe(false);
    expect(createBatchSchema.safeParse(validBatch({ gender: "X" })).success).toBe(false);
    expect(createBatchSchema.safeParse(validBatch({ unexpected_field: true })).success).toBe(false);
  });

  it("rejects an entry date before the birth date", () => {
    expect(createBatchSchema.safeParse(validBatch({ birth_date: "2026-05-22", entry_date: "2026-05-21" })).success).toBe(false);
  });
});
