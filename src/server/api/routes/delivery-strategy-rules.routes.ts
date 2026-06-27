import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { decimalStringSchema } from "../schemas/decimal-string.js";
import { paginationQueryFields } from "../schemas/query-params.schema.js";
import { validateBody, validateQuery } from "../validate.js";
import { dataResponse, listResponse } from "../../shared/api-response.js";

const deliveryStrategyRulesListQuerySchema = z.object({
  ...paginationQueryFields
});

const createDeliveryStrategyRuleSchema = z.object({
  name: z.string().min(1),
  geo_area: z.string().min(1).optional(),
  amount_threshold: decimalStringSchema.optional(),
  quantity_threshold: z.number().int().positive().optional(),
  suggestion_text: z.string().min(1),
  is_active: z.boolean().optional()
}).strict();

const updateDeliveryStrategyRuleSchema = z.object({
  name: z.string().min(1).optional(),
  geo_area: z.string().min(1).optional(),
  amount_threshold: decimalStringSchema.optional(),
  quantity_threshold: z.number().int().positive().optional(),
  suggestion_text: z.string().min(1).optional(),
  is_active: z.boolean().optional()
}).strict();

export function registerDeliveryStrategyRuleRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get(
    "/api/v1/delivery-strategy-rules",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const query = validateQuery(deliveryStrategyRulesListQuerySchema, request.query);
      const result = await deps.deliveryStrategy.listDeliveryStrategyRules({ page: query.page, limit: query.per_page });
      reply.send(
        listResponse(
          result.data.map((rule) => ({
            id: rule.id,
            name: rule.name,
            geo_area: rule.geoArea,
            amount_threshold: rule.amountThreshold,
            quantity_threshold: rule.quantityThreshold,
            suggestion_text: rule.suggestionText,
            is_active: rule.isActive
          })),
          result.meta,
          {}
        )
      );
    }
  );

  app.post(
    "/api/v1/delivery-strategy-rules",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const body = validateBody(createDeliveryStrategyRuleSchema, request.body);
      const result = await deps.deliveryStrategy.createDeliveryStrategyRule({
        actorId: request.user!.id,
        name: body.name,
        geoArea: body.geo_area,
        amountThreshold: body.amount_threshold,
        quantityThreshold: body.quantity_threshold,
        suggestionText: body.suggestion_text,
        isActive: body.is_active
      });
      reply.status(201).send(dataResponse({ id: result.data.id }));
    }
  );

  app.patch(
    "/api/v1/delivery-strategy-rules/:id",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(updateDeliveryStrategyRuleSchema, request.body);
      const result = await deps.deliveryStrategy.updateDeliveryStrategyRule({
        actorId: request.user!.id,
        ruleId: id,
        name: body.name,
        geoArea: body.geo_area,
        amountThreshold: body.amount_threshold,
        quantityThreshold: body.quantity_threshold,
        suggestionText: body.suggestion_text,
        isActive: body.is_active
      });
      reply.send(dataResponse({ id: result.data.id }));
    }
  );
}