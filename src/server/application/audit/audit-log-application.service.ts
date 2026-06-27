import type { AuditLog, AuditLogListFilters, AuditLogRepository, Page } from "../shared/types.js";

export type ListAuditLogsInput = AuditLogListFilters;

export class AuditLogApplicationService {
  constructor(private readonly deps: { auditLogs: AuditLogRepository }) {}

  async listAuditLogs(input: ListAuditLogsInput): Promise<Page<AuditLog>> {
    return this.deps.auditLogs.list(input);
  }
}

