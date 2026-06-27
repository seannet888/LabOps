import { describe, expect, it } from "vitest";
import { changeOrderPricesSchema } from "./change-order-prices.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    reason: "客户长期合作协议价",
    items: [{ order_item_id: "itm_001", actual_price: "25.00" }],
    ...overrides
  };
}

describe("changeOrderPricesSchema", () => {
  it("accepts a valid request", () => {
    expect(changeOrderPricesSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("requires a non-empty reason", () => {
    expect(changeOrderPricesSchema.safeParse(validRequest({ reason: "" })).success).toBe(false);
  });

  it("rejects an actual_price that is not a valid decimal string", () => {
    const request = validRequest({ items: [{ order_item_id: "itm_001", actual_price: "25.999" }] });
    expect(changeOrderPricesSchema.safeParse(request).success).toBe(false);
  });

  it("requires at least one item", () => {
    expect(changeOrderPricesSchema.safeParse(validRequest({ items: [] })).success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(changeOrderPricesSchema.safeParse(validRequest({ unexpected_field: true })).success).toBe(false);
  });
});
