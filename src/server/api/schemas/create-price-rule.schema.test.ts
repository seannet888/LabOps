import { describe, expect, it } from "vitest";
import { createPriceRuleSchema } from "./create-price-rule.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    strain_id: "str_001",
    age_weeks: 4,
    unit_price: "28.00",
    effective_from: "2026-06-01",
    change_reason: "新价格表导入",
    ...overrides
  };
}

describe("createPriceRuleSchema", () => {
  it("accepts a valid request", () => {
    expect(createPriceRuleSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("rejects a negative age_weeks", () => {
    expect(createPriceRuleSchema.safeParse(validRequest({ age_weeks: -1 })).success).toBe(false);
  });

  it("rejects a non-integer age_weeks", () => {
    expect(createPriceRuleSchema.safeParse(validRequest({ age_weeks: 4.5 })).success).toBe(false);
  });

  it("rejects a unit_price that is not a valid decimal string", () => {
    expect(createPriceRuleSchema.safeParse(validRequest({ unit_price: "28.999" })).success).toBe(false);
  });

  it("requires a non-empty change_reason", () => {
    expect(createPriceRuleSchema.safeParse(validRequest({ change_reason: "" })).success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(createPriceRuleSchema.safeParse(validRequest({ unexpected_field: true })).success).toBe(false);
  });
});
