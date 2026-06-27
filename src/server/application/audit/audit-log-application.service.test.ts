import { describe, expect, it } from "vitest";
import type { AuditLogRepository } from "../shared/types.js";
import { AuditLogApplicationService } from "./audit-log-application.service.js";

describe("AuditLogApplicationService.listAuditLogs", () => {
  it("returns filtered audit logs with pagination metadata", async () => {
    const auditLogs = {
      list: async (filters) => ({
        data: [
          {
            id: "aud_001",
            actorId: "usr_001",
            actorName: "张三",
            action: "change_prices",
            entityType: "order",
            entityId: "ord_001",
            oldValue: { actual_price: "28.00" },
            newValue: { actual_price: "25.00" },
            reason: "客户长期合作协议价",
            createdAt: "2026-06-25T11:00:00.000Z"
          }
        ],
        meta: { total: 1, page: filters.page, limit: filters.limit }
      }),
      record: async () => undefined
    } satisfies AuditLogRepository;
    const service = new AuditLogApplicationService({ auditLogs });

    const result = await service.listAuditLogs({ entityType: "order", entityId: "ord_001", page: 1, limit: 20 });

    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({ id: "aud_001", actorName: "张三", entityType: "order" });
  });
});
