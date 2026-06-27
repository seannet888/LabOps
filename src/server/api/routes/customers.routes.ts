import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app-dependencies.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { updateCustomerAddressSchema } from "../schemas/update-customer-address.schema.js";
import { paginationQueryFields } from "../schemas/query-params.schema.js";
import { dataResponse, listResponse } from "../../shared/api-response.js";
import { validateBody, validateQuery } from "../validate.js";

const customerListQuerySchema = z.object({
  q: z.string().optional(),
  geo_area: z.string().optional(),
  ...paginationQueryFields
});

const settlementTypeSchema = z.enum(["single", "monthly"]);

const customerBodyFields = {
  name: z.string().trim().min(1),
  unit_name: z.string().optional(),
  research_group: z.string().optional(),
  geo_area: z.string().optional(),
  settlement_type: settlementTypeSchema,
  credit_days: z.number().int().min(0).optional(),
  default_delivery_method: z.string().optional(),
  default_invoice_type: z.string().optional(),
  notes: z.string().optional()
};

const createCustomerSchema = z.object(customerBodyFields).strict();
const updateCustomerSchema = z.object(customerBodyFields).partial().strict();

export function registerCustomerRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get("/api/v1/customers", { preHandler: requireAuth(deps.auth) }, async (request, reply) => {
    const query = validateQuery(customerListQuerySchema, request.query);
    const result = await deps.customers.listCustomers({
      q: query.q,
      geoArea: query.geo_area,
      page: query.page,
      limit: query.per_page
    });
    reply.send(
      listResponse(
        result.data.map((customer) => ({
          id: customer.id,
          name: customer.name,
          unit_name: customer.unitName,
          research_group: customer.researchGroup,
          geo_area: customer.geoArea,
          settlement_type: customer.settlementType,
          credit_days: customer.creditDays,
          default_delivery_method: customer.defaultDeliveryMethod,
          default_invoice_type: customer.defaultInvoiceType,
          notes: customer.notes,
          is_active: customer.isActive
        })),
        result.meta,
        {}
      )
    );
  });

  app.post(
    "/api/v1/customers",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const body = validateBody(createCustomerSchema, request.body);
      const result = await deps.customers.createCustomer({
        name: body.name,
        unitName: body.unit_name,
        researchGroup: body.research_group,
        geoArea: body.geo_area,
        settlementType: body.settlement_type,
        creditDays: body.credit_days,
        defaultDeliveryMethod: body.default_delivery_method,
        defaultInvoiceType: body.default_invoice_type,
        notes: body.notes
      });
      reply.status(201).send(dataResponse({ id: result.data.id, name: result.data.name }));
    }
  );

  app.patch(
    "/api/v1/customers/:id",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(updateCustomerSchema, request.body);
      const result = await deps.customers.updateCustomer({
        customerId: id,
        name: body.name,
        unitName: body.unit_name,
        researchGroup: body.research_group,
        geoArea: body.geo_area,
        settlementType: body.settlement_type,
        creditDays: body.credit_days,
        defaultDeliveryMethod: body.default_delivery_method,
        defaultInvoiceType: body.default_invoice_type,
        notes: body.notes
      });
      reply.send(dataResponse({ id: result.data.id }));
    }
  );

  app.patch(
    "/api/v1/customer-addresses/:id",
    { preHandler: [requireAuth(deps.auth), requireRole("sales", "manager")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = validateBody(updateCustomerAddressSchema, request.body);
      const result = await deps.customers.updateDeliveryAddress({
        addressId: id,
        actorId: request.user!.id,
        detail: body.detail,
        isDefault: body.is_default,
        changeReason: body.change_reason
      });
      reply.send(dataResponse({ id: result.data.id }));
    }
  );
}
