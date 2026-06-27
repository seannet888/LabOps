import { describe, expect, it, vi } from "vitest";
import { handleError } from "./error-handler.js";

describe("handleError", () => {
  it("logs unexpected errors before returning the internal error envelope", () => {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn();
    const logError = vi.fn();
    const error = new Error("boom");

    handleError(
      error,
      { id: "req_1", log: { error: logError } } as never,
      { status, send } as never
    );

    expect(logError).toHaveBeenCalledWith({ err: error, requestId: "req_1" }, "unhandled error");
    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({ error: { code: "internal_error", message: "服务器内部错误", request_id: "req_1" } });
  });
});
