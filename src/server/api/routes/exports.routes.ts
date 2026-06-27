import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { orderStatusSchema } from "../schemas/query-params.schema.js";
import { validateQuery } from "../validate.js";

const exportOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  "created_at[gte]": z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  "created_at[lte]": z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export function registerExportRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get(
    "/api/v1/exports/orders.xlsx",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const query = validateQuery(exportOrdersQuerySchema, request.query);
      const result = await deps.exports.exportOrdersXlsx({
        status: query.status,
        createdAtGte: query["created_at[gte]"],
        createdAtLte: query["created_at[lte]"]
      });

      reply
        .header("content-type", result.data.contentType)
        .header("content-disposition", `attachment; filename="${result.data.fileName}"`)
        .send(result.data.buffer);
    }
  );
}

