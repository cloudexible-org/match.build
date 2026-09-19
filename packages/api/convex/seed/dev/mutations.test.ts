/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { DEV_MATCHMAKER, DEV_MEMBERS, DEV_USERS } from "./fixture";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://matchmaker.localhost/app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seed.dev.mutations.apply", () => {
  test("creates every account, the profile, the book and the invite", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.seed.dev.mutations.apply, {});

    expect(result.accounts.map((a) => a.email)).toEqual(
      DEV_USERS.map((u) => u.email),
    );

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      matchmakers: await ctx.db.query("matchmakers").collect(),
      candidates: await ctx.db.query("candidates").collect(),
      conversations: await ctx.db.query("conversations").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));

    expect(state.users).toHaveLength(DEV_USERS.length);
    expect(
      state.users.every((u) => u.emailVerificationTime !== undefined),
    ).toBe(true);
    expect(state.matchmakers).toHaveLength(1);
    expect(state.matchmakers[0].username).toBe(DEV_MATCHMAKER.username);

    const joined = state.candidates.filter((c) => c.membership === "joined");
    const invited = state.candidates.filter((c) => c.membership === "invited");
    expect(joined).toHaveLength(DEV_MEMBERS.length);
    expect(invited).toHaveLength(1);
    expect(invited[0].invite).toBeDefined();
    expect(state.conversations).toHaveLength(DEV_MEMBERS.length);

    const seeded = DEV_MEMBERS.flatMap((m) => m.messages);
    expect(state.messages).toHaveLength(seeded.length);
    const thread = state.conversations.find((c) => c.lastSeq > 0);
    expect(thread?.lastSeq).toBe(seeded.length);
    // The last message is matchmaker-only, so the candidate's view ends earlier.
    expect(thread?.lastPublicSeq).toBe(2);
  });

  test("is a no-op the second time", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});
    const again = await t.mutation(internal.seed.dev.mutations.apply, {});

    expect(again.created).toEqual([]);
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      candidates: (await ctx.db.query("candidates").collect()).length,
    }));
    expect(counts).toEqual({
      users: DEV_USERS.length,
      candidates: DEV_MEMBERS.length + 1,
    });
  });

  test("refuses to run where SITE_URL is not on .localhost", async () => {
    vi.stubEnv("SITE_URL", "https://www.aileenlancif.com/app");
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seed.dev.mutations.apply, {}),
    ).rejects.toThrow(/not a dev deployment/);
  });

  test("refuses to run where RESEND_API_KEY is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seed.dev.mutations.apply, {}),
    ).rejects.toThrow(/not a dev deployment/);
  });
});
