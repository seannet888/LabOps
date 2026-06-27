import { describe, expect, it } from "vitest";
import { createOrderSchema } from "./create-order.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: "cus_001",
    delivery_method: "self_vehicle",
    planned_delivery_date: "2026-06-27",
    requires_invoice: true,
    invoice_type: "tech_service",
    notes: "客户要求上午送达",
    items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "28.00" }],
    ...overrides
  };
}

describe("createOrderSchema", () => {
  it("accepts a valid request", () => {
    expect(createOrderSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("accepts a request without actual_price (system uses current price)", () => {
    const request = validRequest({ items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20 }] });
    expect(createOrderSchema.safeParse(request).success).toBe(true);
  });

  it("rejects quantity of zero or less", () => {
    const request = validRequest({
      items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 0 }]
    });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects a gender other than M or F", () => {
    const request = validRequest({
      items: [{ strain_id: "str_001", age_weeks: 5, gender: "X", quantity: 20 }]
    });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects a negative age_weeks", () => {
    const request = validRequest({
      items: [{ strain_id: "str_001", age_weeks: -1, gender: "M", quantity: 20 }]
    });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects a non-integer age_weeks", () => {
    const request = validRequest({
      items: [{ strain_id: "str_001", age_weeks: 5.5, gender: "M", quantity: 20 }]
    });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects an actual_price that is not a valid decimal string", () => {
    const request = validRequest({
      items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "not-a-price" }]
    });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    const request = validRequest({ unexpected_field: "should fail" });
    expect(createOrderSchema.safeParse(request).success).toBe(false);
  });

  it("rejects blank customer and strain identifiers", () => {
    expect(createOrderSchema.safeParse(validRequest({ customer_id: "" })).success).toBe(false);
    expect(createOrderSchema.safeParse(validRequest({ items: [{ strain_id: "", age_weeks: 5, gender: "M", quantity: 20 }] })).success).toBe(false);
  });

  it("rejects invalid planned delivery dates", () => {
    expect(createOrderSchema.safeParse(validRequest({ planned_delivery_date: "2026/06/27" })).success).toBe(false);
  });
});
