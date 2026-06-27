import type { AuditLogApplicationService } from "../application/audit/audit-log-application.service.js";
import type { AuthApplicationService } from "../application/auth/login.service.js";
import type { CatalogApplicationService } from "../application/catalog/catalog-application.service.js";
import type { CustomerApplicationService } from "../application/customers/customer-application.service.js";
import type { DeliveryApplicationService } from "../application/delivery/delivery-application.service.js";
import type { DeliveryStrategyApplicationService } from "../application/delivery-strategy/delivery-strategy-application.service.js";
import type { DocumentApplicationService } from "../application/documents/document-application.service.js";
import type { InventoryApplicationService } from "../application/inventory/inventory-application.service.js";
import type { OrderExportApplicationService } from "../application/exports/order-export-application.service.js";
import type { OrderApplicationService } from "../application/orders/order-application.service.js";

export interface AppDependencies {
  audit: AuditLogApplicationService;
  auth: AuthApplicationService;
  orders: OrderApplicationService;
  delivery: DeliveryApplicationService;
  deliveryStrategy: DeliveryStrategyApplicationService;
  inventory: InventoryApplicationService;
  customers: CustomerApplicationService;
  catalog: CatalogApplicationService;
  documents: DocumentApplicationService;
  exports: OrderExportApplicationService;
}


