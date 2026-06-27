import Fastify, { type FastifyInstance } from "fastify";
import type { AppDependencies } from "./app-dependencies.js";
import { handleError } from "./error-handler.js";
import { registerAuditLogRoutes } from "./routes/audit-logs.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCatalogRoutes } from "./routes/catalog.routes.js";
import { registerCustomerRoutes } from "./routes/customers.routes.js";
import { registerDeliveryTaskRoutes } from "./routes/delivery-tasks.routes.js";
import { registerDeliveryStrategyRuleRoutes } from "./routes/delivery-strategy-rules.routes.js";
import { registerExportRoutes } from "./routes/exports.routes.js";
import { registerInventoryRoutes } from "./routes/inventory.routes.js";
import { registerOrderRoutes } from "./routes/orders.routes.js";

export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : { level: "info" } });
  app.setErrorHandler(handleError);

  registerAuthRoutes(app, deps);
  registerAuditLogRoutes(app, deps);
  registerOrderRoutes(app, deps);
  registerDeliveryTaskRoutes(app, deps);
  registerDeliveryStrategyRuleRoutes(app, deps);
  registerCustomerRoutes(app, deps);
  registerCatalogRoutes(app, deps);
  registerInventoryRoutes(app, deps);
  registerExportRoutes(app, deps);

  return app;
}


