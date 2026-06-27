import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/auth.js";
import { DataTable } from "../../components/DataTable.js";
import { Button } from "../../components/Button.js";
import { ErrorState } from "../../components/ErrorState.js";
import { Input } from "../../components/Input.js";
import { formatApiError } from "../../lib/form-errors.js";
import { listAuditLogs, type AuditLog } from "./api/audit.api.js";
import { auditActionLabel, formatAuditValue } from "./audit-presenters.js";
import { auditFiltersFromSearchParams, auditSearchParamsFromFilters } from "./audit-filters.js";

type AuditLogRow = AuditLog;

export function AuditLogsPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entityTypeFilter, setEntityTypeFilter] = useState(searchParams.get("entity_type") ?? "");
  const [entityIdFilter, setEntityIdFilter] = useState(searchParams.get("entity_id") ?? "");

  const filters = auditFiltersFromSearchParams(searchParams);

  const auditLogsQuery = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => listAuditLogs(filters, auth.token)
  });

  function updateFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearchParams(auditSearchParamsFromFilters({ perPage: filters.perPage, entityType: entityTypeFilter, entityId: entityIdFilter }));
  }

  function changePage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    next.set("per_page", String(filters.perPage));
    setSearchParams(next);
  }

  const rows: AuditLogRow[] = auditLogsQuery.data?.data ?? [];
  const formattedError = auditLogsQuery.error ? formatApiError(auditLogsQuery.error) : null;

  return (
    <section aria-labelledby="audit-logs-title" className="page-stack">
      <div className="page-title-row">
        <div>
          <h1 id="audit-logs-title">审计日志</h1>
          <p>管理员只读查询关键业务操作记录。</p>
        </div>
      </div>

      <form className="filter-bar" aria-label="审计日志筛选" onSubmit={updateFilters}>
        <Input aria-label="实体类型筛选" placeholder="entity_type" value={entityTypeFilter} onChange={(event) => setEntityTypeFilter(event.target.value)} />
        <Input aria-label="实体 ID 筛选" placeholder="entity_id" value={entityIdFilter} onChange={(event) => setEntityIdFilter(event.target.value)} />
        <Button variant="secondary" type="submit">筛选</Button>
      </form>

      {formattedError ? <ErrorState message={formattedError.message} requestId={formattedError.requestId} /> : null}

      <div className="page-panel">
        <DataTable
          loading={auditLogsQuery.isLoading}
          columns={[
            { key: "createdAt", header: "时间" },
            { key: "actorName", header: "操作者", render: (row) => row.actorName ?? row.actorId ?? "-" },
            { key: "action", header: "动作", render: (row) => auditActionLabel(row.action) },
            { key: "entityType", header: "实体类型" },
            { key: "entityId", header: "实体 ID", render: (row) => row.entityId ?? "-" },
            { key: "oldValue", header: "旧值", render: (row) => formatAuditValue(row.oldValue) },
            { key: "newValue", header: "新值", render: (row) => formatAuditValue(row.newValue) },
            { key: "reason", header: "原因", render: (row) => row.reason ?? "-" }
          ]}
          rows={rows}
          pagination={{
            page: auditLogsQuery.data?.meta.page ?? 1,
            totalPages: auditLogsQuery.data?.meta.totalPages ?? 1,
            onPageChange: changePage
          }}
        />
      </div>
    </section>
  );
}
