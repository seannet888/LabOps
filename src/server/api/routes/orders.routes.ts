import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { changeOrderPricesSchema } from "../schemas/change-order-prices.schema.js";
import { createOrderSchema } from "../schemas/create-order.schema.js";
import { orderStatusSchema, paginationQueryFields } from "../schemas/query-params.schema.js";
import { dataResponse, listResponse } from "../../shared/api-response.js";
import { validateBody, validateQuery } from "../validate.js";
import { idempotencyKeyOf } from "../idempotency-key.js";

const orderListQuerySchema = z.object({
  customer_id: z.string().min(1).optional(),
  status: orderStatusSchema.optional(),
  ...paginationQueryFields
});

const confirmOrderSchema = z.object({
  confirm_note: z.string().optional()
}).strict();

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1)
}).strict();

const settleOrderSchema = z.object({
  settled_at: dateOnlySchema.optional(),
  payment_method: z.string().optional(),
  note: z.string().optional()
}).strict();

const archiveDocumentsSchema = z.object({
  note: z.string().optional()
}).strict();

const invoiceRegistrationSchema = z.object({
  invoice_type: z.string().trim().min(1),
  invoice_number: z.string().optional(),
  registered_at: dateOnlySchema,
  note: z.string().optional()
}).strict();

function toOrderDto(order: {
  id: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  status: string;
  totalAmount?: string;
  invoiceRequired: boolean;
  invoiceType?: string;
  createdAt?: string;
}) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    customer_id: order.customerId,
    customer_name: order.customerName,
    status: order.status,
    total_amount: order.totalAmount,
    requires_invoice: order.invoiceRequired,
    invoice_type: order.invoiceType,
    created_at: order.createdAt
  };
}

export function registerOrderRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get(
    "/api/v1/orders",
    { preHandler: requireAuth(deps.auth) },
    async (request, reply) => {
      const query = validateQuery(orderListQuerySchema, request.query);
      const result = await deps.orders.listOrders({
        customerId: query.customer_id,
        status: query.status,
        page: query.page,
        limit: query.per_page
      });
      reply.send(
        listResponse(
          result.data.map(toOrderDto),
          result.meta,
          {}
        )
      );
    }
  );

  app.get(
    "/api/v1/orders/:id",
    { preHandler: requireAuth(deps.auth) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await deps.orders.getOrder(id);
      reply.send(dataResponse(toOrderDto(result.data)));
    }
  );

  app.post(
    "/api/v1/orders",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const body = validateBody(createOrderSchema, request.body);
      const result = await deps.orders.createOrder({
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        customerId: body.customer_id,
        deliveryMethod: body.delivery_method,
        plannedDeliveryDate: body.planned_delivery_date,
        requiresInvoice: body.requires_invoice,
        invoiceType: body.invoice_type,
        notes: body.notes,
        items: body.items.map((item) => ({
          strainId: item.strain_id,
          ageWeeks: item.age_weeks,
          gender: item.gender,
          quantity: item.quantity,
          actualPrice: item.actual_price
        }))
      });
      reply.status(201).send(
        dataResponse({
          id: result.data.id,
          order_number: result.data.orderNumber,
          status: result.data.status,
          total_amount: result.data.totalAmount
        })
      );
    }
  );

  app.post(
    "/api/v1/orders/:id/confirm",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(confirmOrderSchema, request.body ?? {});
      const result = await deps.orders.confirmOrder({
        orderId: id,
        actor: request.user!.role as "sales" | "manager",
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        confirmNote: body.confirm_note
      });
      reply.send(
        dataResponse(
          { id: result.data.id, status: result.data.status, delivery_task_id: result.data.deliveryTaskId },
          { meta: { events: result.meta.events } }
        )
      );
    }
  );

  app.post(
    "/api/v1/orders/:id/change-prices",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(changeOrderPricesSchema, request.body);
      const result = await deps.orders.changeOrderPrices({
        orderId: id,
        actor: request.user!.role as "sales" | "manager",
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        reason: body.reason,
        items: body.items.map((item) => ({ orderItemId: item.order_item_id, actualPrice: item.actual_price }))
      });
      reply.send(dataResponse({ id: result.data.id }));
    }
  );

  app.post(
    "/api/v1/orders/:id/cancel",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(cancelOrderSchema, request.body);
      const result = await deps.orders.cancelOrder({
        orderId: id,
        actor: request.user!.role as "sales" | "manager",
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        reason: body.reason
      });
      reply.send(dataResponse({ id: result.data.id, status: result.data.status }));
    }
  );

  app.post(
    "/api/v1/orders/:id/settle",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(settleOrderSchema, request.body ?? {});
      const result = await deps.orders.settleOrder({
        orderId: id,
        actor: request.user!.role as "sales" | "manager",
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        settledAt: body.settled_at,
        paymentMethod: body.payment_method,
        note: body.note
      });
      reply.send(dataResponse({ id: result.data.id, status: result.data.status }));
    }
  );

  app.post(
    "/api/v1/orders/:id/archive-documents",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(archiveDocumentsSchema, request.body ?? {});
      const result = await deps.orders.archiveDocuments({
        orderId: id,
        actor: request.user!.role as "sales" | "manager",
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request),
        note: body.note
      });
      reply.send(dataResponse({ id: result.data.id, status: result.data.status }));
    }
  );


  app.get(
    "/api/v1/orders/:id/delivery-suggestions",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await deps.deliveryStrategy.getOrderDeliverySuggestions(id);
      reply.send(
        dataResponse(
          result.data.map((suggestion) => ({
            code: suggestion.code,
            message: suggestion.message,
            rule_id: suggestion.ruleId,
            impact: suggestion.impact
          }))
        )
      );
    }
  );
  app.post(
    "/api/v1/orders/:id/invoice-registration",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(invoiceRegistrationSchema, request.body);
      const result = await deps.documents.registerInvoice({
        orderId: id,
        invoiceType: body.invoice_type,
        invoiceNumber: body.invoice_number,
        registeredAt: body.registered_at,
        note: body.note,
        actorId: request.user!.id,
        idempotencyKey: idempotencyKeyOf(request)
      });
      reply.status(201).send(dataResponse({ id: result.data.id }));
    }
  );
}

