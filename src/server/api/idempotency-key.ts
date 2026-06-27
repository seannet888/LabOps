import { ValidationError } from "../application/errors.js";

export function idempotencyKeyOf(request: { headers: Record<string, unknown> }): string {
  const header = request.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header;
  }

  throw new ValidationError([{ field: "Idempotency-Key", message: "required", code: "required" }]);
}