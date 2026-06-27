import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ApplicationError, ERROR_CODE_HTTP_STATUS } from "../application/errors.js";
import { errorResponse } from "../shared/api-error.js";

export function handleError(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof ApplicationError) {
    const status = ERROR_CODE_HTTP_STATUS[error.code] ?? 500;
    reply.status(status).send(
      errorResponse({
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: request.id
      })
    );
    return;
  }

  request.log.error({ err: error, requestId: request.id }, "unhandled error");
  reply.status(500).send(
    errorResponse({
      code: "internal_error",
      message: "服务器内部错误",
      requestId: request.id
    })
  );
}
