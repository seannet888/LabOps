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
import { OrderExportApplicationService } from "../application/exports/order-export-application.service.js";
import { OrderApplicationService } from "../application/orders/order-application.service.js";
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
import type { DeliveryTask, InventoryBatch, Order, User } from "../application/shared/types.js";
import { buildApp } from "./app.js";

describe("HTTP routes", () => {
  let app: FastifyInstance;
  let orders: Map<string, Order>;
  let tasks: Map<string, DeliveryTask>;
  let batches: Map<string, InventoryBatch>;
  let users: Map<string, User>;
  let customers: InMemoryCustomerRepository;

  beforeEach(async () => {
    orders = new Map([["ord_001", buildOrder({ status: "confirmed" })]]);
    tasks = new Map([["dt_001", buildDeliveryTask({ status: "scheduled" })]]);
    batches = new Map([["batch_001", buildInventoryBatch()]]);
    users = new Map([
      ["usr_sales", buildUser({ id: "usr_sales", username: "sales01", role: "sales", passwordHash: await hashPassword("pw") })],
      ["usr_logistics", buildUser({ id: "usr_logistics", username: "log01", role: "logistics", passwordHash: await hashPassword("pw") })],
      ["usr_manager", buildUser({ id: "usr_manager", username: "mgr01", role: "manager", passwordHash: await hashPassword("pw") })]
    ]);
    customers = new InMemoryCustomerRepository();
    customers.setAddress({ id: "addr_001", customerId: "cus_001", addressType: "delivery", detail: "旧地址", isDefault: true });

    const orderRepo = new InMemoryOrderRepository(orders);
    const deliveryTaskRepo = new InMemoryDeliveryTaskRepository(tasks);
    const inventoryRepo = new InMemoryInventoryRepository(new Map([["strain_c57:4:M", 20]]), batches);
    const auditLogs = new InMemoryAuditLogRepository();
    const idempotency = new InMemoryIdempotencyRepository();
    const catalogRepo = new InMemoryCatalogRepository();

    app = buildApp({
      audit: new AuditLogApplicationService({ auditLogs }),
      auth: new AuthApplicationService({
        users: new InMemoryUserRepository(users),
        sessions: new InMemorySessionRepository()
      }),
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
        deliveryStrategyRules: { listActive: async () => [], create: async () => ({ id: "rule_1" }), update: async (ruleId: string) => ({ id: ruleId }) }
      }),
      exports: new OrderExportApplicationService({ orders: orderRepo }),
      inventory: new InventoryApplicationService({
        orders: orderRepo,
        deliveryTasks: deliveryTaskRepo,
        inventory: inventoryRepo,
        auditLogs,
        idempotency
      }),
      customers: new CustomerApplicationService({ customers, auditLogs }),
      catalog: new CatalogApplicationService({ catalog: catalogRepo, auditLogs }),
      documents: new DocumentApplicationService({ documents: new InMemoryDocumentRepository(), idempotency })
    });
  });

  async function loginAs(username: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username, password: "pw" }
    });
    return JSON.parse(response.body).data.access_token;
  }

  describe("POST /api/v1/auth/login", () => {
    it("returns a bearer token and user info on valid credentials", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: "sales01", password: "pw" }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.token_type).toBe("Bearer");
      expect(body.data.user.role).toBe("sales");
    });

    it("returns the standard 401 error envelope for wrong credentials", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: "sales01", password: "wrong" }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("unauthorized");
      expect(body.error.request_id).toBeTruthy();
    });
  });

  describe("POST /api/v1/orders", () => {
    it("validates the body and calls OrderApplicationService.createOrder", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-create-order" },
        payload: {
          customer_id: "cus_001",
          items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "28.00" }]
        }
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body).data.status).toBe("pending");
    });

    it("returns 409 when the same Idempotency-Key is reused with a different order payload", async () => {
      const token = await loginAs("sales01");
      const first = await app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-create-conflict" },
        payload: {
          customer_id: "cus_001",
          items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 20, actual_price: "28.00" }]
        }
      });
      const second = await app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-create-conflict" },
        payload: {
          customer_id: "cus_001",
          items: [{ strain_id: "str_001", age_weeks: 5, gender: "M", quantity: 21, actual_price: "28.00" }]
        }
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(JSON.parse(second.body).error.code).toBe("conflict");
    });
    it("returns 422 validation_error for a malformed body", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: { customer_id: "cus_001", items: [{ strain_id: "str_001", age_weeks: 5, gender: "X", quantity: 20 }] }
      });

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error.code).toBe("validation_error");
    });
  });

  describe("POST /api/v1/orders/:id/confirm", () => {
    it("requires sales or manager and forwards the Idempotency-Key", async () => {
      orders.set("ord_001", buildOrder({ status: "pending" }));
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/orders/ord_001/confirm",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-1" },
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data.status).toBe("confirmed");
    });

    it("returns the saved result when an order confirm command is repeated with the same payload", async () => {
      orders.set("ord_001", buildOrder({ status: "pending" }));
      const token = await loginAs("sales01");
      const request = {
        method: "POST" as const,
        url: "/api/v1/orders/ord_001/confirm",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-confirm-repeat" },
        payload: {}
      };

      const first = await app.inject(request);
      const second = await app.inject(request);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.body).data).toEqual(JSON.parse(first.body).data);
    });
    it("returns 403 forbidden for a logistics user", async () => {
      orders.set("ord_001", buildOrder({ status: "pending" }));
      const token = await loginAs("log01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/orders/ord_001/confirm",
        headers: { authorization: `Bearer ${token}` },
        payload: {}
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe("forbidden");
    });
  });

  describe("POST /api/v1/delivery-tasks/:id/confirm-shipment", () => {
    it("requires logistics or manager", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/delivery-tasks/dt_001/confirm-shipment",
        headers: { authorization: `Bearer ${token}` },
        payload: { stock_deductions: [{ order_item_id: "item_1", inventory_batch_id: "batch_001", quantity: 10 }] }
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 422 when stock deductions are missing", async () => {
      const token = await loginAs("log01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/delivery-tasks/dt_001/confirm-shipment",
        headers: { authorization: `Bearer ${token}` },
        payload: { stock_deductions: [] }
      });

      expect(response.statusCode).toBe(422);
    });

    it("returns the saved result when shipment confirmation is repeated with the same payload", async () => {
      const token = await loginAs("log01");
      const request = {
        method: "POST" as const,
        url: "/api/v1/delivery-tasks/dt_001/confirm-shipment",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-shipment-repeat" },
        payload: { stock_deductions: [{ order_item_id: "item_1", inventory_batch_id: "batch_001", quantity: 10 }] }
      };

      const first = await app.inject(request);
      const second = await app.inject(request);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(JSON.parse(second.body).data).toEqual(JSON.parse(first.body).data);
    });
    it("confirms shipment for a valid logistics request", async () => {
      const token = await loginAs("log01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/delivery-tasks/dt_001/confirm-shipment",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "idem-confirm-shipment" },
        payload: { stock_deductions: [{ order_item_id: "item_1", inventory_batch_id: "batch_001", quantity: 10 }] }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data.status).toBe("shipped");
    });
  });

  describe("PATCH /api/v1/customer-addresses/:id", () => {
    it("returns 422 when change_reason is missing", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/customer-addresses/addr_001",
        headers: { authorization: `Bearer ${token}` },
        payload: { detail: "新地址" }
      });

      expect(response.statusCode).toBe(422);
    });

    it("updates the address with a valid change_reason", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/customer-addresses/addr_001",
        headers: { authorization: `Bearer ${token}` },
        payload: { detail: "北京市海淀区xxx楼xxx室", change_reason: "客户实验室搬迁" }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/v1/price-rules", () => {
    it("returns 403 for a non-manager", async () => {
      const token = await loginAs("sales01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/price-rules",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          strain_id: "str_001",
          age_weeks: 4,
          unit_price: "28.00",
          effective_from: "2026-06-01",
          change_reason: "新价格表导入"
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it("creates a price rule for a manager", async () => {
      const token = await loginAs("mgr01");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/price-rules",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          strain_id: "str_001",
          age_weeks: 4,
          unit_price: "28.00",
          effective_from: "2026-06-01",
          change_reason: "新价格表导入"
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe("unauthenticated requests", () => {
    it("returns 401 unauthorized without a Bearer token", async () => {
      const response = await app.inject({ method: "GET", url: "/api/v1/me" });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe("unauthorized");
    });
  });
});



