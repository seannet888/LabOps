import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { paginationQueryFields } from "../schemas/query-params.schema.js";
import { validateQuery } from "../validate.js";
import { listResponse } from "../../shared/api-response.js";

const auditLogListQuerySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  ...paginationQueryFields
});

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function registerAuditLogRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get(
    "/api/v1/audit-logs",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const query = validateQuery(auditLogListQuerySchema, request.query);
      const result = await deps.audit.listAuditLogs({
        entityType: query.entity_type,
        entityId: query.entity_id,
        page: query.page,
        limit: query.per_page
      });

      reply.send(
        listResponse(
          result.data.map((entry) => ({
            id: entry.id,
            actor_id: entry.actorId,
            actor_name: entry.actorName,
            action: entry.action,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            old_value: jsonValue(entry.oldValue),
            new_value: jsonValue(entry.newValue),
            reason: entry.reason,
            created_at: entry.createdAt
          })),
          result.meta,
          {}
        )
      );
    }
  );
}

