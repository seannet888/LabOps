import { describe, expect, it } from "vitest";
import { buildPrismaAppDependencies } from "./prisma-app-dependencies.js";

describe("buildPrismaAppDependencies", () => {
  it("builds every application dependency from one Prisma adapter graph", () => {
    const deps = buildPrismaAppDependencies({} as never);

    expect(deps.auth).toBeDefined();
    expect(deps.orders).toBeDefined();
    expect(deps.delivery).toBeDefined();
    expect(deps.inventory).toBeDefined();
    expect(deps.customers).toBeDefined();
    expect(deps.catalog).toBeDefined();
    expect(deps.documents).toBeDefined();
  });
});