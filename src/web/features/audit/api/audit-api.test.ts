import { afterEach, describe, expect, it, vi } from "vitest";
import { listAuditLogs, mapAuditLogDto } from "./audit.api.js";

const auditLogDto = {
  id: "aud_001",
  actor_id: "usr_001",
  actor_name: "Manager",
  action: "confirm_order",
  entity_type: "order",
  entity_id: "ord_001",
  old_value: { status: "pending" },
  new_value: { status: "confirmed" },
  reason: "客户确认",
  created_at: "2026-06-25T11:00:00.000Z"
};

describe("audit api boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps audit log DTOs to frontend models", () => {
    expect(mapAuditLogDto(auditLogDto)).toEqual({
      id: "aud_001",
      actorId: "usr_001",
      actorName: "Manager",
      action: "confirm_order",
      entityType: "order",
      entityId: "ord_001",
      oldValue: { status: "pending" },
      newValue: { status: "confirmed" },
      reason: "客户确认",
      createdAt: "2026-06-25T11:00:00.000Z"
    });
  });

  it("serializes audit list filters using backend query keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [auditLogDto],
      meta: { page: 2, per_page: 20, total: 1, total_pages: 1 },
      links: { self: "/api/v1/audit-logs?page=2" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAuditLogs({ page: 2, perPage: 20, entityType: "order", entityId: "ord_001" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/audit-logs?page=2&per_page=20&entity_type=order&entity_id=ord_001");
    expect(result.data[0]?.action).toBe("confirm_order");
  });
});
