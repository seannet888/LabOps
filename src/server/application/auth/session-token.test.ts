import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./session-token.js";

describe("generateSessionToken", () => {
  it("generates a high-entropy, unique token each time", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });
});

describe("hashSessionToken", () => {
  it("is deterministic for the same token", () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(hashSessionToken(generateSessionToken()));
  });

  it("never returns the raw token as its own hash", () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).not.toBe(token);
  });
});
