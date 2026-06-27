import { describe, expect, it } from "vitest";
import { decimalStringSchema } from "./decimal-string.js";

describe("decimalStringSchema", () => {
  it("accepts a plain integer string", () => {
    expect(decimalStringSchema.safeParse("28").success).toBe(true);
  });

  it("accepts a string with up to two decimal places", () => {
    expect(decimalStringSchema.safeParse("28.00").success).toBe(true);
  });

  it("rejects more than two decimal places", () => {
    expect(decimalStringSchema.safeParse("28.001").success).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(decimalStringSchema.safeParse("-28.00").success).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(decimalStringSchema.safeParse("twenty-eight").success).toBe(false);
  });

  it("rejects a plain number instead of a string", () => {
    expect(decimalStringSchema.safeParse(28).success).toBe(false);
  });
});
