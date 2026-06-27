export interface DocumentReleaseCheckInput {
  certificateMissing: boolean;
  certificateMissingReason?: string;
  invoiceRequired: boolean;
  invoiceMissing: boolean;
  invoiceMissingReason?: string;
}

export type DocumentReleaseBlockedReason = "missing_certificate_reason" | "missing_invoice_reason";

export interface DocumentReleaseCheckResult {
  allowed: boolean;
  requiresAudit: boolean;
  blockedReason?: DocumentReleaseBlockedReason;
}

export function evaluateDocumentRelease(input: DocumentReleaseCheckInput): DocumentReleaseCheckResult {
  const certificateUnresolved = input.certificateMissing && !input.certificateMissingReason;
  if (certificateUnresolved) {
    return { allowed: false, requiresAudit: false, blockedReason: "missing_certificate_reason" };
  }

  const invoiceUnresolved = input.invoiceRequired && input.invoiceMissing && !input.invoiceMissingReason;
  if (invoiceUnresolved) {
    return { allowed: false, requiresAudit: false, blockedReason: "missing_invoice_reason" };
  }

  const certificateReleasedWithReason = input.certificateMissing && Boolean(input.certificateMissingReason);
  const invoiceReleasedWithReason =
    input.invoiceRequired && input.invoiceMissing && Boolean(input.invoiceMissingReason);

  return { allowed: true, requiresAudit: certificateReleasedWithReason || invoiceReleasedWithReason };
}
