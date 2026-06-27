import { describe, expect, it } from "vitest";
import { updateCustomerAddressSchema } from "./update-customer-address.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    detail: "北京市海淀区xxx楼xxx室",
    is_default: true,
    change_reason: "客户实验室搬迁",
    ...overrides
  };
}

describe("updateCustomerAddressSchema", () => {
  it("accepts a valid request", () => {
    expect(updateCustomerAddressSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("requires change_reason to be non-empty", () => {
    expect(updateCustomerAddressSchema.safeParse(validRequest({ change_reason: "" })).success).toBe(false);
  });

  it("requires change_reason to be present", () => {
    const { change_reason: _change_reason, ...rest } = validRequest();
    expect(updateCustomerAddressSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(updateCustomerAddressSchema.safeParse(validRequest({ unexpected_field: true })).success).toBe(false);
  });
});
