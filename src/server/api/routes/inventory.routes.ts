import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { createBatchSchema } from "../schemas/create-batch.schema.js";
import { idempotencyKeyOf } from "../idempotency-key.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { dataResponse, listResponse } from "../../shared/api-response.js";
import { genderSchema, paginationQueryFields } from "../schemas/query-params.schema.js";
import { validateBody, validateQuery } from "../validate.js";

const inventoryBatchListQuerySchema = z.object({
  strain_id: z.string().min(1).optional(),
  gender: genderSchema.optional(),
  ...paginationQueryFields
});

const inventoryAvailabilityQuerySchema = z.object({
  strain_id: z.string().trim().min(1),
  age_weeks: z.coerce.number().int().min(0),
  gender: genderSchema
});

export function registerInventoryRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get("/api/v1/inventory-batches", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const query = validateQuery(inventoryBatchListQuerySchema, request.query);
    const result = await deps.inventory.listBatches({
      strainId: query.strain_id,
      gender: query.gender,
      page: query.page,
      limit: query.per_page
    });
    reply.send(
      listResponse(
        result.data.map((batch) => ({
          id: batch.id,
          strain_id: batch.strainId,
          strain_name: batch.strainName,
          species_name: batch.speciesName,
          birth_date: batch.birthDate,
          age_weeks: batch.ageWeeks,
          gender: batch.gender,
          initial_qty: batch.initialQty,
          reserved_qty: batch.reservedQty,
          available_qty: batch.availableQty,
          is_aging: batch.isAging,
          entry_date: batch.entryDate
        })),
        result.meta,
        {}
      )
    );
  });

  app.post(
    "/api/v1/inventory-batches",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const body = validateBody(createBatchSchema, request.body);
      const result = await deps.inventory.createBatch({
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        strainId: body.strain_id,
        birthDate: body.birth_date,
        gender: body.gender,
        initialQty: body.initial_qty,
        entryDate: body.entry_date,
        notes: body.notes
      });
      reply.status(201).send(dataResponse({ id: result.data.id }));
    }
  );

  app.get("/api/v1/inventory-availability", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const query = validateQuery(inventoryAvailabilityQuerySchema, request.query);
    const result = await deps.inventory.getAvailability({
      strainId: query.strain_id,
      ageWeeks: query.age_weeks,
      gender: query.gender
    });
    reply.send(
      dataResponse({
        strain_id: query.strain_id,
        age_weeks: query.age_weeks,
        gender: query.gender,
        available_qty: result.data.availableQty,
        reserved_qty: result.data.reservedQty,
        aging_qty: result.data.agingQty
      })
    );
  });
}
