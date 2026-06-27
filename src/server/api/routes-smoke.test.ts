import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { hashPassword } from "../application/auth/password.js";
import { AuditLogApplicationService } from "../application/audit/audit-log-application.service.js";
import { AuthApplicationService } from "../application/auth/login.service.js";
import { CatalogApplicationService } from "../application/catalog/catalog-application.service.js";
import { CustomerApplicationService } from "../application/customers/customer-application.service.js";
import { DeliveryApplicationService } from "../application/delivery/delivery-application.service.js";
import { DeliveryStrategyApplicationService } from "../application/delivery-strategy/delivery-strategy-application.service.js";
import { DocumentApplicationService } from "../application/documents/document-application.service.js";
import { InventoryApplicationService } from "../application/inventory/inventory-application.service.js";
import { OrderApplicationService } from "../application/orders/order-application.service.js";
import { OrderExportApplicationService } from "../application/exports/order-export-application.service.js";
import {
  buildDeliveryTask,
  buildInventoryBatch,
  buildOrder,
  buildUser,
  InMemoryAuditLogRepository,
  InMemoryCatalogRepository,
  InMemoryCustomerRepository,
  InMemoryDeliveryTaskRepository,
  InMemoryDocumentRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository,
  InMemorySessionRepository,
  InMemoryUserRepository
} from "../application/shared/test-fixtures.js";
import type { DeliveryTask, InventoryBatch, Order, Species, Strain, User } from "../application/shared/types.js";
import { buildApp } from "./app.js";

function authHeaders(token: string, idempotencyKey?: string): Record<string, string> {
  return idempotencyKey
    ? { authorization: `Bearer ${token}`, "idempotency-key": idempotencyKey }
    : { authorization: `Bearer ${token}` };
}

describe("HTTP routes smoke coverage", () => {
  let app: FastifyInstance;
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let batches: Map<string, InventoryBatch>;
  let customers: InMemoryCustomerRepository;
  let salesToken: string;
  let managerToken: string;
  let logisticsToken: string;

  beforeEach(async () => {
    orders = new Map([
      ["ord_001", buildOrder({ status: "delivered", customerId: "cus_001" })],
      ["ord_002", buildOrder({ id: "ord_002", status: "invoiced", customerId: "cus_001" })],
      ["ord_003", buildOrder({ id: "ord_003", status: "confirmed", customerId: "cus_001" })]
    ]);
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]]);
    batches = new Map([["batch_001", buildInventoryBatch()]]);
    customers = new InMemoryCustomerRepository();
    customers.setAddress({ id: "addr_001", customerId: "cus_001", addressType: "delivery", detail: "Old address", isDefault: true });

    const species: Species[] = [{ id: "spc_mouse", name: "Mouse", grade: "SPF" }];
    const strains: Strain[] = [{ id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true }];
    const users: Map<string, User> = new Map([
      ["usr_sales", buildUser({ id: "usr_sales", username: "sales01", role: "sales", passwordHash: await hashPassword("pw") })],
      ["usr_manager", buildUser({ id: "usr_manager", username: "mgr01", role: "manager", passwordHash: await hashPassword("pw") })],
      ["usr_logistics", buildUser({ id: "usr_logistics", username: "log01", role: "logistics", passwordHash: await hashPassword("pw") })]
    ]);

    const orderRepo = new InMemoryOrderRepository(orders);
    const deliveryTaskRepo = new InMemoryDeliveryTaskRepository(tasks);
    const inventoryRepo = new InMemoryInventoryRepository(
      new Map([["str_001:5:M", 80]]),
      batches,
      new Map([["strain_c57:4:M", [{ id: "batch_c57", birthDate: "2026-05-01", availableQty: 10 }]]])
    );
    const auditLogs = new InMemoryAuditLogRepository();
    const idempotency = new InMemoryIdempotencyRepository();
    const catalogRepo = new InMemoryCatalogRepository(new Map([["str_001:4", "28.00"]]), species, strains);

    app = buildApp({
      audit: new AuditLogApplicationService({ auditLogs }),
      auth: new AuthApplicationService({ users: new InMemoryUserRepository(users), sessions: new InMemorySessionRepository() }),
      orders: new OrderApplicationService({
        orders: orderRepo,
        catalog: catalogRepo,
        inventory: inventoryRepo,
        deliveryTasks: deliveryTaskRepo,
        auditLogs,
        idempotency
      }),
      delivery: new DeliveryApplicationService({
        orders: orderRepo,
        deliveryTasks: deliveryTaskRepo,
        inventory: inventoryRepo,
        documents: new InMemoryDocumentRepository(),
        auditLogs,
        idempotency
      }),
      deliveryStrategy: new DeliveryStrategyApplicationService({
        orders: orderRepo,
        customers,
        deliveryStrategyRules: {
          create: async () => ({ id: "dsr_created" }),
          update: async (ruleId: string) => ({ id: ruleId }),
          listActive: async () => [
            {
              id: "dsr_001",
              name: "carton fee hint",
              geoArea: undefined,
              amountThreshold: "500.00",
              suggestionText: "Add {remaining_amount} to meet the carton fee hint threshold",
              isActive: true
            }
          ]
        }
      }),
      exports: new OrderExportApplicationService({ orders: orderRepo }),
      inventory: new InventoryApplicationService({ orders: orderRepo, deliveryTasks: deliveryTaskRepo, inventory: inventoryRepo, auditLogs, idempotency }),
      customers: new CustomerApplicationService({ customers, auditLogs }),
      catalog: new CatalogApplicationService({ catalog: catalogRepo, auditLogs }),
      documents: new DocumentApplicationService({ documents: new InMemoryDocumentRepository(), idempotency })
    });

    async function login(username: string): Promise<string> {
      const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password: "pw" } });
      return JSON.parse(response.body).data.access_token;
    }

    salesToken = await login("sales01");
    managerToken = await login("mgr01");
    logisticsToken = await login("log01");
  });


  it("GET /api/v1/me reports permissions that match sales export access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: authHeaders(salesToken) });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.permissions).toContain("orders:export");
  });
  it("GET /api/v1/orders lists orders for the customer", async () => {
    orders.set("ord_001", buildOrder({
      status: "delivered",
      customerId: "cus_001",
      customerName: "Peking Lab",
      orderNumber: "XS20260626a3f8b2c1",
      totalAmount: "560.00",
      invoiceRequired: true,
      invoiceType: "tech_service",
      createdAt: "2026-06-25T10:30:00.000Z"
    }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orders?customer_id=cus_001",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).meta.total).toBe(3);
    expect(JSON.parse(response.body).data[0]).toMatchObject({
      id: "ord_001",
      order_number: "XS20260626a3f8b2c1",
      customer_id: "cus_001",
      customer_name: "Peking Lab",
      status: "delivered",
      total_amount: "560.00",
      requires_invoice: true,
      invoice_type: "tech_service",
      created_at: "2026-06-25T10:30:00.000Z"
    });
  });

  it("POST /api/v1/orders/:id/cancel cancels a cancellable order", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/ord_003/cancel",
      headers: authHeaders(salesToken, "smoke-cancel"),
      payload: { reason: "customer cancelled" }
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.status).toBe("cancelled");
  });

  it("POST /api/v1/orders/:id/archive-documents transitions delivered to invoiced", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/ord_001/archive-documents",
      headers: authHeaders(salesToken, "smoke-archive"),
      payload: { note: "documents archived" }
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.status).toBe("invoiced");
  });

  it("POST /api/v1/orders/:id/settle transitions invoiced to settled", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/ord_002/settle",
      headers: authHeaders(salesToken, "smoke-settle"),
      payload: { payment_method: "bank_transfer" }
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.status).toBe("settled");
  });

  it("POST /api/v1/orders/:id/invoice-registration records invoice info", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders/ord_001/invoice-registration",
      headers: authHeaders(salesToken, "smoke-invoice-registration"),
      payload: { invoice_type: "tech_service", registered_at: "2026-06-25", note: "paper invoice" }
    });
    expect(response.statusCode).toBe(201);
  });

  it("GET /api/v1/delivery-tasks lists tasks filtered by status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks?status=scheduled",
      headers: authHeaders(logisticsToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).meta.total).toBe(1);
  });

  it("GET /api/v1/delivery-tasks/:id/stock-deduction-suggestions returns batch suggestions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/delivery-tasks/dt_001/stock-deduction-suggestions",
      headers: authHeaders(logisticsToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toMatchObject([
      {
        order_item_id: "item_1",
        required_qty: 10,
        suggested_batches: [{ inventory_batch_id: "batch_c57", quantity: 10 }]
      }
    ]);
  });

  it("POST /api/v1/delivery-tasks/:id/flag-sales-action-required flags the task", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/dt_001/flag-sales-action-required",
      headers: authHeaders(logisticsToken, "smoke-flag-sales"),
      payload: { reason: "delivery address needs confirmation" }
    });
    expect(response.statusCode).toBe(200);
  });

  it("POST /api/v1/delivery-tasks/:id/confirm-delivery marks the task delivered", async () => {
    tasks.set("dt_001", buildDeliveryTask({ status: "shipped" }));
    orders.set("ord_001", buildOrder({ status: "shipped" }));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/delivery-tasks/dt_001/confirm-delivery",
      headers: authHeaders(logisticsToken, "smoke-confirm-delivery")
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.status).toBe("delivered");
  });

  it("GET /api/v1/customers lists customers", async () => {
    await customers.create({ name: "Peking Lab", settlementType: "monthly" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/customers",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).meta.total).toBe(1);
  });

  it("POST /api/v1/customers creates a customer", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: authHeaders(salesToken),
      payload: { name: "Tsinghua Lab", settlement_type: "single" }
    });
    expect(response.statusCode).toBe(201);
  });

  it("PATCH /api/v1/customers/:id updates a customer", async () => {
    const created = await customers.create({ name: "Old Name", settlementType: "single" });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/customers/${created.id}`,
      headers: authHeaders(salesToken),
      payload: { name: "New Name" }
    });
    expect(response.statusCode).toBe(200);
  });

  it("GET /api/v1/species lists species", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/species", headers: authHeaders(salesToken) });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toEqual([{ id: "spc_mouse", name: "Mouse", grade: "SPF" }]);
  });

  it("GET /api/v1/strains lists strains", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/strains", headers: authHeaders(salesToken) });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toHaveLength(1);
  });

  it("POST /api/v1/strains requires manager", async () => {
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/v1/strains",
      headers: authHeaders(salesToken),
      payload: { species_id: "spc_mouse", name: "BALB/c" }
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: "/api/v1/strains",
      headers: authHeaders(managerToken),
      payload: { species_id: "spc_mouse", name: "BALB/c" }
    });
    expect(allowed.statusCode).toBe(201);
  });

  it("GET /api/v1/price-rules/current returns the current price", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/price-rules/current?strain_id=str_001&age_weeks=4",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.unit_price).toBe("28.00");
  });

  it("GET /api/v1/price-rules/current returns price_missing when none exists", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/price-rules/current?strain_id=str_unknown&age_weeks=99",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("price_missing");
  });

  it("GET /api/v1/inventory-batches lists batches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).meta.total).toBe(1);
    expect(JSON.parse(response.body).data[0]).toMatchObject({
      id: "batch_001",
      strain_id: "str_001",
      strain_name: "C57BL/6",
      species_name: "Mouse",
      birth_date: "2026-05-21",
      age_weeks: 5,
      gender: "M",
      initial_qty: 100,
      reserved_qty: 20,
      available_qty: 10,
      is_aging: false,
      entry_date: "2026-05-22"
    });
  });

  it("POST /api/v1/inventory-batches creates a batch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken, "smoke-create-batch"),
      payload: { strain_id: "str_001", birth_date: "2026-05-21", gender: "M", initial_qty: 100, entry_date: "2026-05-22" }
    });
    expect(response.statusCode).toBe(201);
  });

  it("POST /api/v1/inventory-batches requires Idempotency-Key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken),
      payload: { strain_id: "str_001", birth_date: "2026-05-21", gender: "M", initial_qty: 100, entry_date: "2026-05-22" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
  });

  it("POST /api/v1/inventory-batches returns the original result for a duplicate idempotency key", async () => {
    const payload = { strain_id: "str_001", birth_date: "2026-05-21", gender: "M", initial_qty: 100, entry_date: "2026-05-22" };
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken, "smoke-create-batch-duplicate"),
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken, "smoke-create-batch-duplicate"),
      payload
    });

    expect(second.statusCode).toBe(201);
    expect(JSON.parse(second.body)).toEqual(JSON.parse(first.body));
  });

  it("POST /api/v1/inventory-batches validates quantity and date order", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-batches",
      headers: authHeaders(salesToken, "smoke-create-batch-invalid"),
      payload: { strain_id: "str_001", birth_date: "2026-05-22", gender: "M", initial_qty: -1, entry_date: "2026-05-21" }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
  });

  it("GET /api/v1/inventory-availability returns the aggregate summary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/inventory-availability?strain_id=str_001&age_weeks=5&gender=M",
      headers: authHeaders(salesToken)
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data.available_qty).toBe(80);
  });

  it("GET /api/v1/audit-logs returns filtered audit logs for managers", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/orders/ord_001/archive-documents",
      headers: authHeaders(salesToken, "smoke-audit-archive"),
      payload: { note: "documents archived" }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs?entity_type=order&entity_id=ord_001&page=1&per_page=20",
      headers: authHeaders(managerToken)
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).meta.total).toBe(1);
    expect(JSON.parse(response.body).data[0]).toMatchObject({
      actor_id: "usr_sales",
      action: "archive_documents",
      entity_type: "order",
      entity_id: "ord_001"
    });
  });

  it("GET /api/v1/audit-logs requires manager role", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/audit-logs", headers: authHeaders(salesToken) });
    expect(response.statusCode).toBe(403);
  });

  it("GET /api/v1/audit-logs validates pagination query", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs?page=0&per_page=20",
      headers: authHeaders(managerToken)
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
  });

  it("GET /api/v1/orders/:id/delivery-suggestions returns suggestion-only hints", async () => {
    await customers.create({ name: "Peking Lab", geoArea: "Haidian", settlementType: "monthly" });
    orders.set("ord_suggest", buildOrder({ id: "ord_suggest", customerId: "cus_1", totalAmount: "360.00" }));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orders/ord_suggest/delivery-suggestions",
      headers: authHeaders(salesToken)
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toEqual([
      {
        code: "near_carton_fee_free",
        message: "Add 140.00 to meet the carton fee hint threshold",
        rule_id: "dsr_001",
        impact: "suggestion_only"
      }
    ]);
  });

  it("GET /api/v1/orders/:id/delivery-suggestions rejects logistics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/orders/ord_001/delivery-suggestions",
      headers: authHeaders(logisticsToken)
    });

    expect(response.statusCode).toBe(403);
  });

  it("GET /api/v1/exports/orders.xlsx downloads an xlsx for sales", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/exports/orders.xlsx?status=delivered",
      headers: authHeaders(salesToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers["content-disposition"]).toContain("orders.xlsx");
    expect(response.rawPayload.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/exports/orders.xlsx rejects logistics", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/exports/orders.xlsx", headers: authHeaders(logisticsToken) });
    expect(response.statusCode).toBe(403);
  });

  it("GET /api/v1/exports/orders.xlsx validates status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/exports/orders.xlsx?status=unknown",
      headers: authHeaders(salesToken)
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("validation_error");
  });
});
