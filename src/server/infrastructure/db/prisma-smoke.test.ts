import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildPrismaAppDependencies } from "./prisma-app-dependencies.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const isLocalDevDatabase = process.env.DATABASE_URL?.includes("127.0.0.1:55432") === true && process.env.DATABASE_URL.includes("lab_mouse_sales_dev");

describe.skipIf(!hasDatabaseUrl)("Prisma database smoke", () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects and builds the production application dependency graph", async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
    const deps = buildPrismaAppDependencies(prisma);
    expect(deps.auth).toBeDefined();
    expect(deps.orders).toBeDefined();
    expect(deps.delivery).toBeDefined();
  });
});
describe.skipIf(!isLocalDevDatabase)("Prisma local dev business smoke", () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs the sales-to-delivery-to-settlement flow through Prisma adapters", async () => {
    const deps = buildPrismaAppDependencies(prisma);
    const salesLogin = await deps.auth.login({ username: "sales01", password: "sales-dev-password" });
    const logisticsLogin = await deps.auth.login({ username: "log01", password: "logistics-dev-password" });

    await prisma.deliveryStrategyRule.create({
      data: {
        name: "local smoke carton hint",
        amountThreshold: "500.00",
        suggestionText: "再增加 {remaining_amount} 元可满足免纸箱运费提示条件"
      }
    });

    const created = await deps.orders.createOrder({
      actorId: salesLogin.data.user.id,
      idempotencyKey: `smoke-create-${Date.now()}`,
      customerId: "1",
      deliveryMethod: "135",
      plannedDeliveryDate: "2026-06-30",
      requiresInvoice: true,
      invoiceType: "normal",
      notes: "local dev smoke order",
      items: [{ strainId: "1", ageWeeks: 4, gender: "M", quantity: 1 }]
    });

    const suggestions = await deps.deliveryStrategy.getOrderDeliverySuggestions(created.data.id);
    expect(suggestions.data[0]?.impact).toBe("suggestion_only");

    const confirmed = await deps.orders.confirmOrder({
      orderId: created.data.id,
      actor: "sales",
      actorId: salesLogin.data.user.id,
      idempotencyKey: `smoke-confirm-${created.data.id}`
    });

    await deps.delivery.scheduleDeliveryTask({
      deliveryTaskId: confirmed.data.deliveryTaskId,
      actorId: logisticsLogin.data.user.id,
      idempotencyKey: `smoke-schedule-${created.data.id}`,
      plannedDeliveryDate: "2026-06-30",
      vehicle: "京A12345",
      driver: "王师傅",
      deliveryBatch: "SMOKE-1",
      routeNotes: "local smoke route"
    });

    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: Number(created.data.id) } });
    const batch = await prisma.inventoryBatch.findFirstOrThrow({ where: { strainId: 1, gender: "M" }, orderBy: { id: "asc" } });

    const shipped = await deps.delivery.confirmShipment({
      deliveryTaskId: confirmed.data.deliveryTaskId,
      actorId: logisticsLogin.data.user.id,
      idempotencyKey: `smoke-ship-${created.data.id}`,
      stockDeductions: [{ orderItemId: String(orderItem.id), inventoryBatchId: String(batch.id), quantity: 1 }],
      documentRelease: { missingCertificate: true, missingInvoice: true, reason: "local smoke weak document release" }
    });
    expect(shipped.data.status).toBe("shipped");

    const delivered = await deps.delivery.confirmDelivery({
      deliveryTaskId: confirmed.data.deliveryTaskId,
      actorId: logisticsLogin.data.user.id,
      idempotencyKey: `smoke-deliver-${created.data.id}`
    });
    expect(delivered.data.status).toBe("delivered");

    const archived = await deps.orders.archiveDocuments({
      orderId: created.data.id,
      actor: "sales",
      actorId: salesLogin.data.user.id,
      idempotencyKey: `smoke-archive-${created.data.id}`
    });
    expect(archived.data.status).toBe("invoiced");

    const settled = await deps.orders.settleOrder({
      orderId: created.data.id,
      actor: "sales",
      actorId: salesLogin.data.user.id,
      idempotencyKey: `smoke-settle-${created.data.id}`,
      paymentMethod: "bank_transfer"
    });
    expect(settled.data.status).toBe("settled");

    const auditLogs = await deps.audit.listAuditLogs({ entityType: "order", entityId: created.data.id, page: 1, limit: 20 });
    expect(auditLogs.meta.total).toBeGreaterThan(0);

    const exported = await deps.exports.exportOrdersXlsx({ status: "settled" });
    expect(exported.data.buffer.length).toBeGreaterThan(0);

    const task = await prisma.deliveryTask.findUnique({ where: { id: Number(confirmed.data.deliveryTaskId) } });
    expect(task?.orderId).toBe(Number(created.data.id));
    expect(task?.status).toBe("delivered");

    const idempotencyRecord = await prisma.idempotencyKey.findFirst({ where: { actorId: Number(salesLogin.data.user.id), endpoint: "POST /orders" } });
    expect(idempotencyRecord).toBeTruthy();
  });
});
