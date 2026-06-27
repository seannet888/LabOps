import { buildQueryString, commandRequest, request, type ListEnvelope } from "../../../lib/api-client.js";

export type SettlementType = "single" | "monthly";

export type CustomerDto = {
  id: string;
  name: string;
  unit_name?: string;
  research_group?: string;
  geo_area?: string;
  settlement_type: SettlementType;
  credit_days?: number;
  default_delivery_method?: string;
  default_invoice_type?: string;
  notes?: string;
  is_active?: boolean;
};

export type Customer = {
  id: string;
  name: string;
  unitName?: string;
  researchGroup?: string;
  geoArea?: string;
  settlementType: SettlementType;
  creditDays: number;
  defaultDeliveryMethod?: string;
  defaultInvoiceType?: string;
  notes?: string;
  isActive: boolean;
};

export type CustomerFilters = {
  page: number;
  perPage: number;
  q?: string;
  geoArea?: string;
};

export type CustomerCommandInput = {
  name: string;
  unitName?: string;
  researchGroup?: string;
  geoArea?: string;
  settlementType: SettlementType;
  creditDays?: number;
  defaultDeliveryMethod?: string;
  defaultInvoiceType?: string;
  notes?: string;
};

export function mapCustomerDto(dto: CustomerDto): Customer {
  return {
    id: dto.id,
    name: dto.name,
    unitName: dto.unit_name,
    researchGroup: dto.research_group,
    geoArea: dto.geo_area,
    settlementType: dto.settlement_type,
    creditDays: dto.credit_days ?? 60,
    defaultDeliveryMethod: dto.default_delivery_method,
    defaultInvoiceType: dto.default_invoice_type,
    notes: dto.notes,
    isActive: dto.is_active ?? true
  };
}

export function toCustomerCommandDto(input: CustomerCommandInput) {
  return {
    name: input.name,
    ...(input.unitName ? { unit_name: input.unitName } : {}),
    ...(input.researchGroup ? { research_group: input.researchGroup } : {}),
    ...(input.geoArea ? { geo_area: input.geoArea } : {}),
    settlement_type: input.settlementType,
    ...(input.creditDays !== undefined ? { credit_days: input.creditDays } : {}),
    ...(input.defaultDeliveryMethod ? { default_delivery_method: input.defaultDeliveryMethod } : {}),
    ...(input.defaultInvoiceType ? { default_invoice_type: input.defaultInvoiceType } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
}

export async function listCustomers(filters: CustomerFilters, token: string | null): Promise<ListEnvelope<Customer>> {
  const response = await request<ListEnvelope<CustomerDto>>(
    `/customers${buildQueryString({
      page: filters.page,
      per_page: filters.perPage,
      q: filters.q,
      geo_area: filters.geoArea
    })}`,
    { token }
  );
  return { ...response, data: response.data.map(mapCustomerDto) };
}

export async function createCustomer(input: CustomerCommandInput, token: string | null): Promise<{ id: string; name?: string }> {
  return commandRequest<{ id: string; name?: string }>("/customers", {
    token,
    body: toCustomerCommandDto(input)
  });
}

export async function updateCustomer(customerId: string, input: CustomerCommandInput, token: string | null): Promise<{ id: string }> {
  return commandRequest<{ id: string }>(`/customers/${customerId}`, {
    method: "PATCH",
    token,
    body: toCustomerCommandDto(input)
  });
}
