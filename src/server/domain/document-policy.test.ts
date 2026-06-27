import { describe, expect, it } from "vitest";
import { evaluateDocumentRelease } from "./document-policy.js";

describe("evaluateDocumentRelease", () => {
  it("allows shipment when nothing is missing", () => {
    const result = evaluateDocumentRelease({
      certificateMissing: false,
      invoiceRequired: true,
      invoiceMissing: false
    });

    expect(result).toEqual({ allowed: true, requiresAudit: false });
  });

  it("blocks shipment when certificate is missing without a reason", () => {
    const result = evaluateDocumentRelease({
      certificateMissing: true,
      invoiceRequired: false,
      invoiceMissing: false
    });

    expect(result).toEqual({ allowed: false, requiresAudit: false, blockedReason: "missing_certificate_reason" });
  });

  it("blocks shipment when a required invoice is missing without a reason", () => {
    const result = evaluateDocumentRelease({
      certificateMissing: false,
      invoiceRequired: true,
      invoiceMissing: true
    });

    expect(result).toEqual({ allowed: false, requiresAudit: false, blockedReason: "missing_invoice_reason" });
  });

  it("allows shipment with a recorded reason and requires an audit entry", () => {
    const result = evaluateDocumentRelease({
      certificateMissing: true,
      certificateMissingReason: "客户要求先发货，合格证补寄",
      invoiceRequired: false,
      invoiceMissing: false
    });

    expect(result).toEqual({ allowed: true, requiresAudit: true });
  });

  it("does not require an invoice reason when invoice is not required", () => {
    const result = evaluateDocumentRelease({
      certificateMissing: false,
      invoiceRequired: false,
      invoiceMissing: true
    });

    expect(result).toEqual({ allowed: true, requiresAudit: false });
  });
});
