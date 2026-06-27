import { describe, expect, it } from "vitest";
import { auditActionLabel, formatAuditValue } from "./audit-presenters.js";

describe("audit presenters", () => {
  it("formats known actions and audit values", () => {
    expect(auditActionLabel("confirm_order")).toBe("确认订单");
    expect(auditActionLabel("unknown_action")).toBe("unknown_action");
    expect(formatAuditValue({ status: "confirmed" })).toBe("状态：confirmed");
    expect(formatAuditValue(undefined)).toBe("-");
  });

  it("formats audit payloads as readable Chinese summaries instead of JSON code", () => {
    expect(formatAuditValue({ deliveredAt: "2026-06-30", note: "E2E delivered" })).toBe("送达日期：2026-06-30；备注：E2E delivered");
    expect(formatAuditValue({ confirmNote: "已确认" })).toBe("确认备注：已确认");
  });

  it("truncates long audit values for table scanning", () => {
    expect(formatAuditValue({ note: "x".repeat(100) })).toHaveLength(80);
    expect(formatAuditValue({ note: "x".repeat(100) }).endsWith("...")).toBe(true);
  });
});
