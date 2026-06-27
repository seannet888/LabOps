import type { AuditLogFilters } from "./api/audit.api.js";

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function auditFiltersFromSearchParams(searchParams: URLSearchParams): AuditLogFilters {
  return {
    page: positiveInteger(searchParams.get("page"), 1),
    perPage: positiveInteger(searchParams.get("per_page"), 20),
    entityType: searchParams.get("entity_type") ?? undefined,
    entityId: searchParams.get("entity_id") ?? undefined
  };
}

export function auditSearchParamsFromFilters(input: {
  perPage: number;
  entityType?: string;
  entityId?: string;
}): URLSearchParams {
  const next = new URLSearchParams();
  next.set("page", "1");
  next.set("per_page", String(input.perPage));
  if (input.entityType) next.set("entity_type", input.entityType);
  if (input.entityId) next.set("entity_id", input.entityId);
  return next;
}
