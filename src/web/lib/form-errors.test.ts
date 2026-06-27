import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiClientError } from "./api-client.js";
import { formatApiError, zodIssuesToFieldErrors } from "./form-errors.js";

describe("frontend form and error helpers", () => {
  it("maps zod issues to field errors", () => {
    const schema = z.object({ entryDate: z.string().min(1, "入库日期必填") });
    const result = schema.safeParse({ entryDate: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodIssuesToFieldErrors(result.error.issues)).toEqual({ entryDate: "入库日期必填" });
    }
  });

  it("formats standard API errors by status with request id", () => {
    expect(formatApiError(new ApiClientError({
      status: 409,
      code: "conflict",
      message: "Conflict",
      requestId: "req_409"
    }))).toEqual({
      code: "conflict",
      status: 409,
      message: "状态已变化，请刷新后确认。",
      requestId: "req_409"
    });
  });

  it("formats missing endpoint errors with a restart hint", () => {
    expect(formatApiError(new ApiClientError({
      status: 404,
      code: "unknown_error",
      message: "请求失败",
      requestId: "unknown"
    }))).toEqual({
      code: "unknown_error",
      status: 404,
      message: "接口未找到，请重启后端服务后重试。",
      requestId: undefined
    });
  });
});
