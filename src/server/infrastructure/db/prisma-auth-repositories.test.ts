import { describe, expect, it } from "vitest";
import { PrismaSessionRepository, PrismaUserRepository } from "./prisma-auth-repositories.js";

describe("PrismaUserRepository", () => {
  it("finds an active user by username and maps it to the application user shape", async () => {
    const repository = new PrismaUserRepository({
      user: {
        findUnique: async () => ({
          id: 1,
          username: "sales01",
          passwordHash: "salt:key",
          displayName: "张三",
          role: "sales",
          isActive: true
        })
      }
    });

    await expect(repository.findByUsername("sales01")).resolves.toEqual({
      id: "1",
      username: "sales01",
      passwordHash: "salt:key",
      displayName: "张三",
      role: "sales",
      isActive: true
    });
  });
});

describe("PrismaSessionRepository", () => {
  it("creates a session and maps it to the application session shape", async () => {
    const expiresAt = new Date("2026-06-25T10:00:00.000Z");
    const repository = new PrismaSessionRepository({
      session: {
        create: async ({ data }) => ({
          id: 7,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt
        }),
        findUnique: async () => null
      }
    });

    await expect(
      repository.create({ userId: "1", tokenHash: "hashed-token", expiresAt })
    ).resolves.toEqual({
      id: "7",
      userId: "1",
      tokenHash: "hashed-token",
      expiresAt
    });
  });
});