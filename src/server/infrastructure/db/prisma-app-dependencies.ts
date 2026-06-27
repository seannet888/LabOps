import type { PrismaClient } from "@prisma/client";
import { AuditLogApplicationService } from "../../application/audit/audit-log-application.service.js";
import { AuthApplicationService } from "../../application/auth/login.service.js";
import { CatalogApplicationService } from "../../application/catalog/catalog-application.service.js";
import { CustomerApplicationService } from "../../application/customers/customer-application.service.js";
import { DeliveryApplicationService } from "../../application/delivery/delivery-application.service.js";
import { DeliveryStrategyApplicationService } from "../../application/delivery-strategy/delivery-strategy-application.service.js";
import { DocumentApplicationService } from "../../application/documents/document-application.service.js";
import { OrderExportApplicationService } from "../../application/exports/order-export-application.service.js";
import { InventoryApplicationService } from "../../application/inventory/inventory-application.service.js";
import { OrderApplicationService } from "../../application/orders/order-application.service.js";
import type { AppDependencies } from "../../api/app-dependencies.js";
import { PrismaTransactionRunner } from "../../application/shared/transaction-runner.js";
import { PrismaSessionRepository, PrismaUserRepository } from "./prisma-auth-repositories.js";
import {
  PrismaAuditLogRepository,
  PrismaCatalogRepository,
  PrismaCustomerRepository,
  PrismaDeliveryStrategyRuleRepository,
  PrismaDeliveryTaskRepository,
  PrismaDocumentRepository,
  PrismaInventoryRepository,
  PrismaOrderRepository,
  type PrismaAuditLogClient,
  type PrismaCatalogClient,
  type PrismaCustomerClient,
  type PrismaDeliveryStrategyRuleClient,
  type PrismaDeliveryTaskClient,
  type PrismaDocumentClient,
  type PrismaInventoryClient,
  type PrismaOrderClient
} from "./prisma-domain-repositories.js";
import { PrismaIdempotencyRepository } from "./prisma-idempotency-repository.js";

export function buildPrismaAppDependencies(prisma: PrismaClient): AppDependencies {
  const users = new PrismaUserRepository(prisma as never);
  const sessions = new PrismaSessionRepository(prisma as never);
  const orders = new PrismaOrderRepository(prisma as unknown as PrismaOrderClient);
  const deliveryTasks = new PrismaDeliveryTaskRepository(prisma as unknown as PrismaDeliveryTaskClient);
  const inventory = new PrismaInventoryRepository(prisma as unknown as PrismaInventoryClient);
  const auditLogs = new PrismaAuditLogRepository(prisma as unknown as PrismaAuditLogClient);
  const idempotency = new PrismaIdempotencyRepository(prisma as never);
  const catalog = new PrismaCatalogRepository(prisma as unknown as PrismaCatalogClient);
  const customers = new PrismaCustomerRepository(prisma as unknown as PrismaCustomerClient);
  const documents = new PrismaDocumentRepository(prisma as unknown as PrismaDocumentClient);
  const deliveryStrategyRules = new PrismaDeliveryStrategyRuleRepository(prisma as unknown as PrismaDeliveryStrategyRuleClient);

  const buildTransactionContext = (client: PrismaClient) => {
    const txOrders = new PrismaOrderRepository(client as unknown as PrismaOrderClient);
    const txDeliveryTasks = new PrismaDeliveryTaskRepository(client as unknown as PrismaDeliveryTaskClient);
    const txInventory = new PrismaInventoryRepository(client as unknown as PrismaInventoryClient);
    const txAuditLogs = new PrismaAuditLogRepository(client as unknown as PrismaAuditLogClient);
    const txIdempotency = new PrismaIdempotencyRepository(client as never);
    const txCatalog = new PrismaCatalogRepository(client as unknown as PrismaCatalogClient);
    const txCustomers = new PrismaCustomerRepository(client as unknown as PrismaCustomerClient);
    const txDocuments = new PrismaDocumentRepository(client as unknown as PrismaDocumentClient);

    return {
      orders: txOrders,
      deliveryTasks: txDeliveryTasks,
      inventory: txInventory,
      auditLogs: txAuditLogs,
      idempotency: txIdempotency,
      catalog: txCatalog,
      customers: txCustomers,
      documents: txDocuments
    };
  };

  const transactionClient = prisma as unknown as { $transaction<T>(callback: (client: PrismaClient) => Promise<T>): Promise<T> };
  const appTransactions = new PrismaTransactionRunner(transactionClient, buildTransactionContext);
  const documentTransactions = new PrismaTransactionRunner(transactionClient, (client: PrismaClient) => ({
    documents: new PrismaDocumentRepository(client as unknown as PrismaDocumentClient),
    idempotency: new PrismaIdempotencyRepository(client as never)
  }));

  return {
    audit: new AuditLogApplicationService({ auditLogs }),
    auth: new AuthApplicationService({ users, sessions }),
    orders: new OrderApplicationService({
      orders,
      catalog,
      inventory,
      deliveryTasks,
      auditLogs,
      idempotency,
      transactions: appTransactions
    }),
    delivery: new DeliveryApplicationService({
      orders,
      deliveryTasks,
      inventory,
      documents,
      auditLogs,
      idempotency,
      transactions: appTransactions
    }),
    deliveryStrategy: new DeliveryStrategyApplicationService({ orders, customers, deliveryStrategyRules }),
    exports: new OrderExportApplicationService({ orders }),
    inventory: new InventoryApplicationService({ orders, deliveryTasks, inventory, auditLogs, idempotency, transactions: appTransactions }),
    customers: new CustomerApplicationService({ customers, auditLogs, transactions: appTransactions }),
    catalog: new CatalogApplicationService({ catalog, auditLogs, transactions: appTransactions }),
    documents: new DocumentApplicationService({ documents, idempotency, transactions: documentTransactions })
  };
}



