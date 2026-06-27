import { describe, expect, it } from "vitest";
import { ConflictError } from "../errors.js";
import { InMemoryDocumentRepository, InMemoryIdempotencyRepository } from "../shared/test-fixtures.js";
import { DocumentApplicationService } from "./document-application.service.js";

describe("DocumentApplicationService.uploadCertificate", () => {
  it("records a certificate attachment for an order", async () => {
    const documents = new InMemoryDocumentRepository();
    const service = new DocumentApplicationService({ documents, idempotency: new InMemoryIdempotencyRepository() });

    const result = await service.uploadCertificate({
      orderId: "ord_001",
      fileName: "certificate.pdf",
      filePath: "/uploads/certificate.pdf",
      batchDesc: "C57BL/6 5周雄性 20只",
      actorId: "user_sales"
    });

    expect(result.data.id).toBeTruthy();
    expect(documents.certificates).toEqual([
      {
        orderId: "ord_001",
        fileName: "certificate.pdf",
        filePath: "/uploads/certificate.pdf",
        batchDesc: "C57BL/6 5周雄性 20只",
        uploadedBy: "user_sales"
      }
    ]);
  });

  it("records certificate attachments through the transaction runner", async () => {
    let transactionCalls = 0;
    const outerDocuments = new InMemoryDocumentRepository();
    const transactionalDocuments = new InMemoryDocumentRepository();
    const service = new DocumentApplicationService({
      documents: outerDocuments,
      idempotency: new InMemoryIdempotencyRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({ documents: transactionalDocuments, idempotency: new InMemoryIdempotencyRepository() });
        }
      }
    });

    await service.uploadCertificate({
      orderId: "ord_001",
      fileName: "certificate.pdf",
      filePath: "/uploads/certificate.pdf",
      actorId: "user_sales"
    });

    expect(transactionCalls).toBe(1);
    expect(outerDocuments.certificates).toHaveLength(0);
    expect(transactionalDocuments.certificates).toHaveLength(1);
  });
});

describe("DocumentApplicationService.registerInvoice", () => {
  it("records invoice registration info for an order", async () => {
    const documents = new InMemoryDocumentRepository();
    const service = new DocumentApplicationService({ documents, idempotency: new InMemoryIdempotencyRepository() });

    const result = await service.registerInvoice({
      orderId: "ord_001",
      invoiceType: "tech_service",
      registeredAt: "2026-06-25",
      note: "纸质发票随货",
      actorId: "user_sales",
      idempotencyKey: "idem_invoice_1"
    });

    expect(result.data.id).toBeTruthy();
    expect(documents.invoiceRegistrations).toEqual([
      {
        orderId: "ord_001",
        invoiceType: "tech_service",
        invoiceNumber: undefined,
        registeredAt: "2026-06-25",
        note: "纸质发票随货",
        registeredBy: "user_sales"
      }
    ]);
  });

  it("returns the original result on duplicate invoice registration idempotency keys", async () => {
    const documents = new InMemoryDocumentRepository();
    const service = new DocumentApplicationService({ documents, idempotency: new InMemoryIdempotencyRepository() });
    const input = {
      orderId: "ord_001",
      invoiceType: "tech_service",
      registeredAt: "2026-06-25",
      actorId: "user_sales",
      idempotencyKey: "idem_invoice_1"
    };

    const first = await service.registerInvoice(input);
    const second = await service.registerInvoice(input);

    expect(second).toEqual(first);
    expect(documents.invoiceRegistrations).toHaveLength(1);
  });

  it("throws ConflictError when an invoice registration key is reused with a different payload", async () => {
    const documents = new InMemoryDocumentRepository();
    const service = new DocumentApplicationService({ documents, idempotency: new InMemoryIdempotencyRepository() });

    await service.registerInvoice({
      orderId: "ord_001",
      invoiceType: "tech_service",
      registeredAt: "2026-06-25",
      actorId: "user_sales",
      idempotencyKey: "idem_invoice_1"
    });

    await expect(
      service.registerInvoice({
        orderId: "ord_001",
        invoiceType: "tech_service",
        registeredAt: "2026-06-26",
        actorId: "user_sales",
        idempotencyKey: "idem_invoice_1"
      })
    ).rejects.toThrow(ConflictError);
  });
});
