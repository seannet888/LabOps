import { idempotencyRequestHash } from "../shared/idempotency.js";
import type { TransactionRunner } from "../shared/transaction-runner.js";
import type { DocumentRepository, IdempotencyRepository } from "../shared/types.js";

export interface UploadCertificateInput {
  orderId: string;
  fileName: string;
  filePath: string;
  batchDesc?: string;
  actorId: string;
}

export interface UploadCertificateResult {
  data: {
    id: string;
  };
}

export interface RegisterInvoiceInput {
  orderId: string;
  invoiceType: string;
  invoiceNumber?: string;
  registeredAt: string;
  note?: string;
  actorId: string;
  idempotencyKey: string;
}

export interface RegisterInvoiceResult {
  data: {
    id: string;
  };
}

export interface DocumentApplicationServiceDependencies {
  documents: DocumentRepository;
  idempotency: IdempotencyRepository;
  transactions?: TransactionRunner<DocumentApplicationTransactionContext>;
}

export interface DocumentApplicationTransactionContext {
  documents: DocumentRepository;
  idempotency: IdempotencyRepository;
}

const REGISTER_INVOICE_ENDPOINT = "POST /orders/{id}/invoice-registration";

export class DocumentApplicationService {
  constructor(private readonly deps: DocumentApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: DocumentApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async uploadCertificate(input: UploadCertificateInput): Promise<UploadCertificateResult> {
    return this.inTransaction(async (deps) => {
      const certificate = await deps.documents.recordCertificate({
        orderId: input.orderId,
        fileName: input.fileName,
        filePath: input.filePath,
        batchDesc: input.batchDesc,
        uploadedBy: input.actorId
      });

      return { data: { id: certificate.id } };
    });
  }

  async registerInvoice(input: RegisterInvoiceInput): Promise<RegisterInvoiceResult> {
    const requestHash = idempotencyRequestHash(input);
    return this.inTransaction(async (deps) => {
      const existingResult = await deps.idempotency.findResult<RegisterInvoiceResult>(
        input.actorId,
        REGISTER_INVOICE_ENDPOINT,
        input.idempotencyKey,
        requestHash
      );
      if (existingResult) {
        return existingResult;
      }

      const registration = await deps.documents.recordInvoiceRegistration({
        orderId: input.orderId,
        invoiceType: input.invoiceType,
        invoiceNumber: input.invoiceNumber,
        registeredAt: input.registeredAt,
        note: input.note,
        registeredBy: input.actorId
      });

      const result: RegisterInvoiceResult = { data: { id: registration.id } };
      await deps.idempotency.saveResult(input.actorId, REGISTER_INVOICE_ENDPOINT, input.idempotencyKey, result, requestHash);

      return result;
    });
  }
}
