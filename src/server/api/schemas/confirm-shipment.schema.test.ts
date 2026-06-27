import { describe, expect, it } from "vitest";
import { confirmShipmentSchema } from "./confirm-shipment.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    stock_deductions: [{ order_item_id: "itm_001", inventory_batch_id: "inv_001", quantity: 20 }],
    document_release: {
      missing_certificate: true,
      missing_invoice: false,
      reason: "合格证已随货纸质交付，扫描件下午补传"
    },
    ...overrides
  };
}

describe("confirmShipmentSchema", () => {
  it("accepts a valid request", () => {
    expect(confirmShipmentSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("accepts a request without document_release when nothing is missing", () => {
    const { document_release: _document_release, ...rest } = validRequest();
    expect(confirmShipmentSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects a stock deduction quantity of zero or less", () => {
    const request = validRequest({
      stock_deductions: [{ order_item_id: "itm_001", inventory_batch_id: "inv_001", quantity: 0 }]
    });
    expect(confirmShipmentSchema.safeParse(request).success).toBe(false);
  });

  it("requires document_release.reason when a certificate is missing", () => {
    const request = validRequest({
      document_release: { missing_certificate: true, missing_invoice: false }
    });
    expect(confirmShipmentSchema.safeParse(request).success).toBe(false);
  });

  it("requires document_release.reason when an invoice is missing", () => {
    const request = validRequest({
      document_release: { missing_certificate: false, missing_invoice: true }
    });
    expect(confirmShipmentSchema.safeParse(request).success).toBe(false);
  });

  it("allows an empty document_release when nothing is missing", () => {
    const request = validRequest({
      document_release: { missing_certificate: false, missing_invoice: false }
    });
    expect(confirmShipmentSchema.safeParse(request).success).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    expect(confirmShipmentSchema.safeParse(validRequest({ unexpected_field: true })).success).toBe(false);
  });
});
