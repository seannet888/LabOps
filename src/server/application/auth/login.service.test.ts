import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "./password.js";
import { hashSessionToken } from "./session-token.js";
import { AuthApplicationService } from "./login.service.js";
import { UnauthorizedError } from "../errors.js";
import {
  buildUser,
  InMemorySessionRepository,
  InMemoryUserRepository
} from "../shared/test-fixtures.js";
import type { User } from "../shared/types.js";

describe("AuthApplicationService.login", () => {
  let users: Map<string, User>;
  let userRepository: InMemoryUserRepository;
  let sessionRepository: InMemorySessionRepository;
  let service: AuthApplicationService;

  beforeEach(async () => {
    const passwordHash = await hashPassword("s3cret-pass");
    users = new Map([["usr_001", buildUser({ passwordHash })]]);
    userRepository = new InMemoryUserRepository(users);
    sessionRepository = new InMemorySessionRepository();
    service = new AuthApplicationService({ users: userRepository, sessions: sessionRepository });
  });

  it("returns a bearer access token and user info on correct credentials", async () => {
    const result = await service.login({ username: "sales01", password: "s3cret-pass" });

    expect(result.data.tokenType).toBe("Bearer");
    expect(result.data.expiresIn).toBe(7200);
    expect(result.data.user).toEqual({ id: "usr_001", displayName: "张三", role: "sales" });
    expect(result.data.accessToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws UnauthorizedError for a wrong password", async () => {
    await expect(service.login({ username: "sales01", password: "wrong" })).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for an unknown username", async () => {
    await expect(service.login({ username: "nobody", password: "s3cret-pass" })).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for an inactive user", async () => {
    users.set("usr_001", buildUser({ passwordHash: await hashPassword("s3cret-pass"), isActive: false }));

    await expect(service.login({ username: "sales01", password: "s3cret-pass" })).rejects.toThrow(UnauthorizedError);
  });
});

describe("AuthApplicationService.getCurrentUser", () => {
  let userRepository: InMemoryUserRepository;
  let sessionRepository: InMemorySessionRepository;
  let service: AuthApplicationService;

  beforeEach(async () => {
    const passwordHash = await hashPassword("s3cret-pass");
    userRepository = new InMemoryUserRepository(new Map([["usr_001", buildUser({ passwordHash })]]));
    sessionRepository = new InMemorySessionRepository();
    service = new AuthApplicationService({ users: userRepository, sessions: sessionRepository });
  });

  it("resolves the current user from a valid token", async () => {
    const loginResult = await service.login({ username: "sales01", password: "s3cret-pass" });

    const result = await service.getCurrentUser(loginResult.data.accessToken);

    expect(result.data.id).toBe("usr_001");
    expect(result.data.role).toBe("sales");
    expect(result.data.permissions).toEqual(expect.arrayContaining(["orders:create", "orders:confirm"]));
  });

  it("throws UnauthorizedError for an unknown token", async () => {
    await expect(service.getCurrentUser("not-a-real-token")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for an expired session", async () => {
    const loginResult = await service.login({ username: "sales01", password: "s3cret-pass" });

    const session = await sessionRepository.findByTokenHash(hashSessionToken(loginResult.data.accessToken));
    if (session) {
      session.expiresAt = new Date(Date.now() - 1000);
    }

    await expect(service.getCurrentUser(loginResult.data.accessToken)).rejects.toThrow(UnauthorizedError);
  });
});
