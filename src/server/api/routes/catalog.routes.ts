import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { createPriceRuleSchema } from "../schemas/create-price-rule.schema.js";
import { dataResponse } from "../../shared/api-response.js";
import { errorResponse } from "../../shared/api-error.js";
import { validateBody, validateQuery } from "../validate.js";

const listStrainsQuerySchema = z.object({
  species_id: z.string().min(1).optional(),
  is_active: z.enum(["true", "false"]).optional()
});

const createStrainSchema = z.object({
  species_id: z.string().trim().min(1),
  name: z.string().trim().min(1)
}).strict();

const updateStrainSchema = z.object({
  is_active: z.boolean()
}).strict();

const currentPriceQuerySchema = z.object({
  strain_id: z.string().trim().min(1),
  age_weeks: z.coerce.number().int().min(0)
});

export function registerCatalogRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get("/api/v1/species", { preHandler: requireAuth(deps.auth) }, async (_request, reply) => {
    const result = await deps.catalog.listSpecies();
    reply.send({ data: result.data });
  });

  app.get("/api/v1/strains", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const query = validateQuery(listStrainsQuerySchema, request.query);
    const result = await deps.catalog.listStrains({
      speciesId: query.species_id,
      isActive: query.is_active === undefined ? undefined : query.is_active === "true"
    });
    reply.send({
      data: result.data.map((strain) => ({
        id: strain.id,
        species_id: strain.speciesId,
        name: strain.name,
        is_active: strain.isActive
      }))
    });
  });

  app.post(
    "/api/v1/strains",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const body = validateBody(createStrainSchema, request.body);
      const result = await deps.catalog.createStrain({ speciesId: body.species_id, name: body.name });
      reply.status(201).send(
        dataResponse({ id: result.data.id, species_id: result.data.speciesId, name: result.data.name, is_active: true })
      );
    }
  );

  app.patch(
    "/api/v1/strains/:strainId",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const body = validateBody(updateStrainSchema, request.body);
      const params = request.params as { strainId: string };
      const result = await deps.catalog.updateStrainStatus({ strainId: params.strainId, isActive: body.is_active });
      reply.send(dataResponse({ id: result.data.id, is_active: result.data.isActive }));
    }
  );

  app.get(
    "/api/v1/price-rules/current",
    { preHandler: requireAuth(deps.auth) },
    async (request, reply) => {
      const query = validateQuery(currentPriceQuerySchema, request.query);
      const price = await deps.catalog.getCurrentPriceForStrain(query.strain_id, query.age_weeks);
      if (!price) {
        reply.status(422).send(errorResponse({ code: "price_missing", message: "缺少当前有效价格", requestId: request.id }));
        return;
      }
      reply.send(
        dataResponse({ strain_id: query.strain_id, age_weeks: query.age_weeks, unit_price: price.unitPrice, effective_from: price.effectiveFrom })
      );
    }
  );

  app.post(
    "/api/v1/price-rules",
    { preHandler: [requireAuth(deps.auth), requireRole("manager")] },
    async (request, reply) => {
      const body = validateBody(createPriceRuleSchema, request.body);
      const result = await deps.catalog.createPriceRule({
        actorId: request.user!.id,
        strainId: body.strain_id,
        ageWeeks: body.age_weeks,
        unitPrice: body.unit_price,
        effectiveFrom: body.effective_from,
        changeReason: body.change_reason
      });
      reply.status(201).send(dataResponse({ id: result.data.id }));
    }
  );
}
