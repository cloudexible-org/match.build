import { describe, expect, test } from "vitest";
import { deriveInviteToken, hashInviteToken } from "./helpers";

describe("invite tokens", () => {
  test("are deterministic per secret, candidate and nonce, and URL-safe", async () => {
    const token = await deriveInviteToken("secret", "cand1", "nonce1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deriveInviteToken("secret", "cand1", "nonce1")).toBe(token);

    const others = await Promise.all([
      deriveInviteToken("other-secret", "cand1", "nonce1"),
      deriveInviteToken("secret", "cand2", "nonce1"),
      deriveInviteToken("secret", "cand1", "nonce2"),
    ]);
    for (const other of others) expect(other).not.toBe(token);
  });

  test("are stored only as a SHA-256 hex hash", async () => {
    // SHA-256("abc"), the standard test vector.
    expect(await hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
