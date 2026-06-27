import { describe, expect, it } from "vitest";
import { ConflictError } from "../../application/errors.js";
import { PrismaIdempotencyRepository } from "./prisma-idempotency-repository.js";

describe("PrismaIdempotencyRepository", () => {
  it("returns the stored response when actor, endpoint, key, and request hash match", async () => {
    const repository = new PrismaIdempotencyRepository({
      idempotencyKey: {
        findUnique: async () => ({ requestHash: "hash_1", responseSnapshot: { data: { id: "ord_001" } } }),
        create: async () => ({})
      }
    });

    await expect(repository.findResult("1", "POST /orders", "idem_1", "hash_1")).resolves.toEqual({
      data: { id: "ord_001" }
    });
  });

  it("throws ConflictError when an idempotency key is reused with a different request hash", async () => {
    const repository = new PrismaIdempotencyRepository({
      idempotencyKey: {
        findUnique: async () => ({ requestHash: "hash_1", responseSnapshot: { data: { id: "ord_001" } } }),
        create: async () => ({})
      }
    });

    await expect(repository.findResult("1", "POST /orders", "idem_1", "hash_2")).rejects.toThrow(ConflictError);
  });

  it("reuses the stored response when create hits a duplicate key race with the same request hash", async () => {
    let createCalls = 0;
    const repository = new PrismaIdempotencyRepository({
      idempotencyKey: {
        findUnique: async () => ({ requestHash: "hash_1", responseSnapshot: { data: { id: "ord_001" } } }),
        create: async () => {
          createCalls += 1;
          throw { code: "P2002" };
        }
      }
    });

    await expect(repository.saveResult("1", "POST /orders", "idem_1", { data: { id: "ord_new" } }, "hash_1")).resolves.toBeUndefined();
    expect(createCalls).toBe(1);
  });

  it("throws ConflictError when duplicate key race finds a different request hash", async () => {
    const repository = new PrismaIdempotencyRepository({
      idempotencyKey: {
        findUnique: async () => ({ requestHash: "hash_1", responseSnapshot: { data: { id: "ord_001" } } }),
        create: async () => {
          throw { code: "P2002" };
        }
      }
    });

    await expect(repository.saveResult("1", "POST /orders", "idem_1", { data: { id: "ord_new" } }, "hash_2")).rejects.toThrow(ConflictError);
  });
});