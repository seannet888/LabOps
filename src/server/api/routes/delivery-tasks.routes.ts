import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { confirmShipmentSchema } from "../schemas/confirm-shipment.schema.js";
import { scheduleDeliveryTaskSchema } from "../schemas/schedule-delivery-task.schema.js";
import { deliveryTaskStatusSchema, paginationQueryFields } from "../schemas/query-params.schema.js";
import { dataResponse, listResponse } from "../../shared/api-response.js";
import { validateBody, validateQuery } from "../validate.js";
import { idempotencyKeyOf } from "../idempotency-key.js";

const deliveryTaskListQuerySchema = z.object({
  status: deliveryTaskStatusSchema.optional(),
  planned_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  geo_area: z.string().optional(),
  ...paginationQueryFields
});

const flagSalesActionRequiredSchema = z.object({
  reason: z.string().trim().min(1)
}).strict();

const confirmDeliverySchema = z.object({
  delivered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().optional()
}).strict();

function toDeliveryTaskDto(task: Awaited<ReturnType<AppDependencies["delivery"]["getDeliveryTask"]>>["data"]) {
  return {
    id: task.id,
    order_id: task.orderId,
    order_number: task.orderNumber,
    status: task.status,
    customer_name: task.customerName,
    geo_area: task.geoArea,
    delivery_address: task.deliveryAddress,
    contact_name: task.contactName,
    contact_phone: task.contactPhone,
    planned_delivery_date: task.plannedDeliveryDate,
    vehicle: task.vehicle,
    driver: task.driver,
    delivery_batch: task.deliveryBatch,
    route_notes: task.routeNotes,
    delivered_at: task.deliveredAt,
    sales_action_required: task.salesActionRequired ?? false,
    sales_action_note: task.salesActionNote,
    document_readiness: task.documentReadiness
      ? {
          certificate_uploaded: task.documentReadiness.certificateUploaded,
          invoice_registered: task.documentReadiness.invoiceRegistered,
          requires_invoice: task.documentReadiness.requiresInvoice
        }
      : undefined
  };
}

export function registerDeliveryTaskRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get("/api/v1/delivery-tasks", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const query = validateQuery(deliveryTaskListQuerySchema, request.query);
    const result = await deps.delivery.listDeliveryTasks({
      status: query.status,
      plannedDeliveryDate: query.planned_delivery_date,
      geoArea: query.geo_area,
      page: query.page,
      limit: query.per_page
    });
    reply.send(
      listResponse(
        result.data.map(toDeliveryTaskDto),
        result.meta,
        {}
      )
    );
  });

  app.get("/api/v1/delivery-tasks/:id", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deps.delivery.getDeliveryTask(id);
    reply.send(dataResponse(toDeliveryTaskDto(result.data)));
  });

  app.get(
    "/api/v1/delivery-tasks/:id/stock-deduction-suggestions",
    { preHandler: [requireAuth(deps.auth), requireRole("logistics", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await deps.inventory.getShipmentSuggestions(id);
      reply.send(
        dataResponse(result.data.map((suggestion) => ({
          order_item_id: suggestion.orderItemId,
          required_qty: suggestion.requiredQty,
          suggested_batches: suggestion.suggestedBatches.map((batch) => ({
            inventory_batch_id: batch.inventoryBatchId,
            quantity: batch.quantity,
            reason: batch.reason
          }))
        })))
      );
    }
  );

  app.post(
    "/api/v1/delivery-tasks/:id/schedule",
    { preHandler: [requireAuth(deps.auth), requireRole("logistics", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(scheduleDeliveryTaskSchema, request.body);
      const result = await deps.delivery.scheduleDeliveryTask({
        deliveryTaskId: id,
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        plannedDeliveryDate: body.planned_delivery_date,
        vehicle: body.vehicle,
        driver: body.driver,
        deliveryBatch: body.delivery_batch,
        routeNotes: body.route_notes
      });
      reply.send(dataResponse({ id: result.data.id, status: result.data.status }));
    }
  );

  app.post(
    "/api/v1/delivery-tasks/:id/flag-sales-action-required",
    { preHandler: [requireAuth(deps.auth), requireRole("logistics", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(flagSalesActionRequiredSchema, request.body);
      const result = await deps.delivery.flagSalesActionRequired({
        deliveryTaskId: id,
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        reason: body.reason
      });
      reply.send(dataResponse({ id: result.data.id }));
    }
  );

  app.post(
    "/api/v1/delivery-tasks/:id/confirm-shipment",
    { preHandler: [requireAuth(deps.auth), requireRole("logistics", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(confirmShipmentSchema, request.body);
      const result = await deps.delivery.confirmShipment({
        deliveryTaskId: id,
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        stockDeductions: body.stock_deductions.map((deduction) => ({
          orderItemId: deduction.order_item_id,
          inventoryBatchId: deduction.inventory_batch_id,
          quantity: deduction.quantity
        })),
        documentRelease: body.document_release
          ? {
              missingCertificate: body.document_release.missing_certificate,
              missingInvoice: body.document_release.missing_invoice,
              reason: body.document_release.reason
            }
          : undefined
      });
      reply.send(
        dataResponse(
          {
            id: result.data.id,
            status: result.data.status,
            order_id: result.data.orderId,
            order_status: result.data.orderStatus
          },
          { meta: { events: result.meta.events } }
        )
      );
    }
  );

  app.post(
    "/api/v1/delivery-tasks/:id/confirm-delivery",
    { preHandler: [requireAuth(deps.auth), requireRole("logistics", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(confirmDeliverySchema, request.body ?? {});
      const result = await deps.delivery.confirmDelivery({
        deliveryTaskId: id,
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        deliveredAt: body.delivered_at,
        note: body.note
      });
      reply.send(
        dataResponse({
          id: result.data.id,
          status: result.data.status,
          order_id: result.data.orderId,
          order_status: result.data.orderStatus
        })
      );
    }
  );
}
