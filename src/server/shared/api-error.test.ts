import { describe, expect, it } from "vitest";
import { errorResponse } from "./api-error.js";

describe("errorResponse", () => {
  it("wraps an error in the standard error envelope", () => {
    const result = errorResponse({
      code: "validation_error",
      message: "请求参数校验失败",
      requestId: "req_20260625_000001",
      details: [{ field: "items.0.quantity", message: "数量必须大于 0", code: "greater_than" }]
    });

    expect(result).toEqual({
      error: {
        code: "validation_error",
        message: "请求参数校验失败",
        details: [{ field: "items.0.quantity", message: "数量必须大于 0", code: "greater_than" }],
        request_id: "req_20260625_000001"
      }
    });
  });

  it("omits details when none are provided", () => {
    const result = errorResponse({
      code: "unauthorized",
      message: "未登录",
      requestId: "req_20260625_000002"
    });

    expect(result).toEqual({
      error: {
        code: "unauthorized",
        message: "未登录",
        request_id: "req_20260625_000002"
      }
    });
    expect(result.error).not.toHaveProperty("details");
  });
});
