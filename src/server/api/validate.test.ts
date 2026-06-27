import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../application/errors.js";
import { validateBody } from "./validate.js";

const schema = z.object({ name: z.string().min(1) }).strict();

describe("validateBody", () => {
  it("returns the parsed body when valid", () => {
    expect(validateBody(schema, { name: "ok" })).toEqual({ name: "ok" });
  });

  it("throws ValidationError with field-level details when invalid", () => {
    try {
      validateBody(schema, { name: "" });
      expect.fail("expected validateBody to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details?.[0]?.field).toBe("name");
    }
  });
});
