import { buildQueryString, request, type ListEnvelope } from "../../../lib/api-client.js";

export type AuditLogDto = {
  id: string;
  actor_id?: string;
  actor_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  createdAt: string;
};

export type AuditLogFilters = {
  page: number;
  perPage: number;
  entityType?: string;
  entityId?: string;
};

export function mapAuditLogDto(dto: AuditLogDto): AuditLog {
  return {
    id: dto.id,
    actorId: dto.actor_id,
    actorName: dto.actor_name,
    action: dto.action,
    entityType: dto.entity_type,
    entityId: dto.entity_id,
    oldValue: dto.old_value,
    newValue: dto.new_value,
    reason: dto.reason,
    createdAt: dto.created_at
  };
}

export async function listAuditLogs(filters: AuditLogFilters, token: string | null): Promise<ListEnvelope<AuditLog>> {
  const response = await request<ListEnvelope<AuditLogDto>>(
    `/audit-logs${buildQueryString({
      page: filters.page,
      per_page: filters.perPage,
      entity_type: filters.entityType,
      entity_id: filters.entityId
    })}`,
    { token }
  );
  return { ...response, data: response.data.map(mapAuditLogDto) };
}
