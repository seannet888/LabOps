import { buildQueryString, commandRequest, request, type ListEnvelope } from "../../../lib/api-client.js";

export type DeliveryTaskStatus = "pending_schedule" | "scheduled" | "shipped" | "delivered" | "cancelled";

export type DeliveryTaskDto = {
  id: string;
  order_id: string;
  order_number?: string;
  status: DeliveryTaskStatus;
  customer_name?: string;
  geo_area?: string;
  delivery_address?: string;
  contact_name?: string;
  contact_phone?: string;
  planned_delivery_date?: string;
  vehicle?: string;
  driver?: string;
  delivery_batch?: string;
  route_notes?: string;
  delivered_at?: string;
  sales_action_required?: boolean;
  sales_action_note?: string;
  document_readiness?: {
    certificate_uploaded: boolean;
    invoice_registered: boolean;
    requires_invoice: boolean;
  };
};

export type DeliveryTask = {
  id: string;
  orderId: string;
  orderNumber?: string;
  status: DeliveryTaskStatus;
  customerName?: string;
  geoArea?: string;
  deliveryAddress?: string;
  contactName?: string;
  contactPhone?: string;
  plannedDeliveryDate?: string;
  vehicle?: string;
  driver?: string;
  deliveryBatch?: string;
  routeNotes?: string;
  deliveredAt?: string;
  salesActionRequired: boolean;
  salesActionNote?: string;
  documentReadiness?: {
    certificateUploaded: boolean;
    invoiceRegistered: boolean;
    requiresInvoice: boolean;
  };
};

export type DeliveryTaskFilters = {
  page: number;
  perPage: number;
  status?: DeliveryTaskStatus;
  plannedDeliveryDate?: string;
  geoArea?: string;
};

export type ScheduleDeliveryInput = {
  plannedDeliveryDate: string;
  vehicle?: string;
  driver?: string;
  deliveryBatch?: string;
  routeNotes?: string;
};

export type ShipmentSuggestionDto = {
  order_item_id: string;
  required_qty: number;
  suggested_batches: Array<{ inventory_batch_id: string; quantity: number; reason: string }>;
};

export type ShipmentSuggestion = {
  orderItemId: string;
  requiredQty: number;
  suggestedBatches: Array<{ inventoryBatchId: string; quantity: number; reason: string }>;
};

export type ConfirmShipmentInput = {
  stockDeductions: Array<{ orderItemId: string; inventoryBatchId: string; quantity: number }>;
  documentRelease?: {
    missingCertificate: boolean;
    missingInvoice: boolean;
    reason: string;
  };
};

export type ConfirmDeliveryInput = {
  deliveredAt?: string;
  note?: string;
};

export type FlagSalesActionInput = {
  reason: string;
};

export function mapDeliveryTaskDto(dto: DeliveryTaskDto): DeliveryTask {
  return {
    id: dto.id,
    orderId: dto.order_id,
    orderNumber: dto.order_number,
    status: dto.status,
    customerName: dto.customer_name,
    geoArea: dto.geo_area,
    deliveryAddress: dto.delivery_address,
    contactName: dto.contact_name,
    contactPhone: dto.contact_phone,
    plannedDeliveryDate: dto.planned_delivery_date,
    vehicle: dto.vehicle,
    driver: dto.driver,
    deliveryBatch: dto.delivery_batch,
    routeNotes: dto.route_notes,
    deliveredAt: dto.delivered_at,
    salesActionRequired: dto.sales_action_required ?? false,
    salesActionNote: dto.sales_action_note,
    documentReadiness: dto.document_readiness
      ? {
          certificateUploaded: dto.document_readiness.certificate_uploaded,
          invoiceRegistered: dto.document_readiness.invoice_registered,
          requiresInvoice: dto.document_readiness.requires_invoice
        }
      : undefined
  };
}

export function mapShipmentSuggestionDto(dto: ShipmentSuggestionDto): ShipmentSuggestion {
  return {
    orderItemId: dto.order_item_id,
    requiredQty: dto.required_qty,
    suggestedBatches: dto.suggested_batches.map((batch) => ({
      inventoryBatchId: batch.inventory_batch_id,
      quantity: batch.quantity,
      reason: batch.reason
    }))
  };
}

export function toScheduleDeliveryDto(input: ScheduleDeliveryInput) {
  return {
    planned_delivery_date: input.plannedDeliveryDate,
    ...(input.vehicle ? { vehicle: input.vehicle } : {}),
    ...(input.driver ? { driver: input.driver } : {}),
    ...(input.deliveryBatch ? { delivery_batch: input.deliveryBatch } : {}),
    ...(input.routeNotes ? { route_notes: input.routeNotes } : {})
  };
}

export function toConfirmShipmentDto(input: ConfirmShipmentInput) {
  return {
    stock_deductions: input.stockDeductions.map((deduction) => ({
      order_item_id: deduction.orderItemId,
      inventory_batch_id: deduction.inventoryBatchId,
      quantity: deduction.quantity
    })),
    ...(input.documentRelease
      ? {
          document_release: {
            missing_certificate: input.documentRelease.missingCertificate,
            missing_invoice: input.documentRelease.missingInvoice,
            reason: input.documentRelease.reason
          }
        }
      : {})
  };
}

export async function listDeliveryTasks(filters: DeliveryTaskFilters, token: string | null): Promise<ListEnvelope<DeliveryTask>> {
  const response = await request<ListEnvelope<DeliveryTaskDto>>(
    `/delivery-tasks${buildQueryString({
      page: filters.page,
      per_page: filters.perPage,
      status: filters.status,
      planned_delivery_date: filters.plannedDeliveryDate,
      geo_area: filters.geoArea
    })}`,
    { token }
  );
  return { ...response, data: response.data.map(mapDeliveryTaskDto) };
}

export async function getDeliveryTask(deliveryTaskId: string, token: string | null): Promise<DeliveryTask> {
  const response = await request<DeliveryTaskDto>(`/delivery-tasks/${deliveryTaskId}`, { token });
  return mapDeliveryTaskDto(response);
}

export async function listShipmentSuggestions(deliveryTaskId: string, token: string | null): Promise<ShipmentSuggestion[]> {
  const response = await request<ShipmentSuggestionDto[]>(`/delivery-tasks/${deliveryTaskId}/stock-deduction-suggestions`, { token });
  return response.map(mapShipmentSuggestionDto);
}

export async function scheduleDeliveryTask(deliveryTaskId: string, input: ScheduleDeliveryInput, token: string | null): Promise<{ id: string; status: DeliveryTaskStatus }> {
  return commandRequest<{ id: string; status: DeliveryTaskStatus }>(`/delivery-tasks/${deliveryTaskId}/schedule`, {
    token,
    body: toScheduleDeliveryDto(input)
  });
}

export async function confirmShipment(deliveryTaskId: string, input: ConfirmShipmentInput, token: string | null): Promise<{ id: string; status: DeliveryTaskStatus; orderId: string; orderStatus: string }> {
  const response = await commandRequest<{ id: string; status: DeliveryTaskStatus; order_id: string; order_status: string }>(`/delivery-tasks/${deliveryTaskId}/confirm-shipment`, {
    token,
    body: toConfirmShipmentDto(input)
  });
  return { id: response.id, status: response.status, orderId: response.order_id, orderStatus: response.order_status };
}

export async function confirmDelivery(deliveryTaskId: string, input: ConfirmDeliveryInput, token: string | null): Promise<{ id: string; status: DeliveryTaskStatus; orderId: string; orderStatus: string }> {
  const response = await commandRequest<{ id: string; status: DeliveryTaskStatus; order_id: string; order_status: string }>(`/delivery-tasks/${deliveryTaskId}/confirm-delivery`, {
    token,
    body: {
      ...(input.deliveredAt ? { delivered_at: input.deliveredAt } : {}),
      ...(input.note ? { note: input.note } : {})
    }
  });
  return { id: response.id, status: response.status, orderId: response.order_id, orderStatus: response.order_status };
}

export async function flagSalesActionRequired(deliveryTaskId: string, input: FlagSalesActionInput, token: string | null): Promise<{ id: string }> {
  return commandRequest<{ id: string }>(`/delivery-tasks/${deliveryTaskId}/flag-sales-action-required`, {
    token,
    body: { reason: input.reason }
  });
}
