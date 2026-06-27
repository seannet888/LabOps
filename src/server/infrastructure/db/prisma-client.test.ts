import { describe, expect, it } from "vitest";
import { getPrismaClient } from "./prisma-client.js";

describe("getPrismaClient", () => {
  it("returns the same Prisma client instance within the process", () => {
    expect(getPrismaClient()).toBe(getPrismaClient());
  });
});
