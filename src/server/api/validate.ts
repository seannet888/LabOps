import type { z } from "zod";
import { ValidationError } from "../application/errors.js";

function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      code: issue.code
    }));
    throw new ValidationError(details);
  }
  return result.data;
}

export function validateBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  return validate(schema, body);
}

export function validateQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  return validate(schema, query);
}