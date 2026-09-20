/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { ACCOUNT_DELETION_MAX_ATTEMPTS } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

/** A test instance that knows this app's tables, so `t.run` is typed. */
function newTest() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof newTest>;

// The deletion code is emailed from a scheduled action, which convex-test runs
// on JavaScript timers.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedMatchmaker(t: T, label: string) {
  return await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      email: `${label}@example.test`,
    });
    return await ctx.db.insert("matchmakers", {
      ownerUserId,
      username: `${label}.matches`,
      usernameKey: `${label}matches`,
      displayName: label,
    });
  });
}

async function addCandidate(
  t: T,
  matchmakerId: Id<"matchmakers">,
  userId: Id<"users">,
  membership: "joined" | "left",
) {
  return await t.run((ctx) =>
    ctx.db.insert("candidates", {
      matchmakerId,
      userId,
      email: "jane@example.test",
      socialHandles: [],
      membership,
      membershipChangedAt: 0,
      status: "active",
    }),
  );
}

describe("users.setName", () => {
  test("rejects a blank name and signed-out callers", async () => {
    const t = newTest();
    await expect(
      t.mutation(api.users.mutations.setName, { name: "Jane" }),
    ).rejects.toThrow("You need to sign in.");

    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test" }),
    );
    await expect(
      t
        .withIdentity({ subject: `${userId}|s` })
        .mutation(api.users.mutations.setName, { name: "   " }),
    ).rejects.toThrow("Enter your name.");
  });

  test("normalises the name and audits it once per joined matchmaker, each in that matchmaker's trail", async () => {
    const t = newTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test", name: "Jane" }),
    );
    const joinedA = await seedMatchmaker(t, "alpha");
    const joinedB = await seedMatchmaker(t, "bravo");
    const left = await seedMatchmaker(t, "charlie");
    const candidateA = await addCandidate(t, joinedA, userId, "joined");
    const candidateB = await addCandidate(t, joinedB, userId, "joined");
    await addCandidate(t, left, userId, "left");

    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(api.users.mutations.setName, { name: "  Jane   Doe " });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.name).toBe("Jane Doe");

    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    const change = [{ field: "name", before: '"Jane"', after: '"Jane Doe"' }];
    expect(events).toHaveLength(3);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "account.name_changed",
          actor: { type: "user", userId, role: "account" },
          changes: change,
        }),
        expect.objectContaining({
          matchmakerId: joinedA,
          candidateId: candidateA,
          actor: { type: "user", userId, role: "candidate" },
          changes: change,
        }),
        expect.objectContaining({
          matchmakerId: joinedB,
          candidateId: candidateB,
        }),
      ]),
    );
    // Exactly one account-level copy, in no matchmaker's trail.
    expect(
      events.filter((event) => event.matchmakerId === undefined),
    ).toHaveLength(1);
    // The matchmaker the person left learns nothing.
    expect(events.some((event) => event.matchmakerId === left)).toBe(false);
  });

  test("setting the same name again is a no-op", async () => {
    const t = newTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test", name: "Jane" }),
    );
    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(api.users.mutations.setName, { name: " Jane " });
    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(events).toHaveLength(0);
  });
});

/*
 * ─── Deleting an account (prd/phase-1.md §3.5) ──────────────────────────────
 */

/** A verified account with a name, as sign-up leaves one. */
async function seedAccount(t: T, email: string) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Jane Doe",
      emailVerificationTime: 1,
    }),
  );
}

/** Asks for a deletion code, runs the mailer, and reads the code back. */
async function requestCode(t: T, userId: Id<"users">, email: string) {
  await t
    .withIdentity({ subject: `${userId}|s` })
    .mutation(api.users.mutations.requestDeletionCode, {});
  vi.advanceTimersByTime(1000);
  await t.finishInProgressScheduledFunctions();
  const sent = await t.run((ctx) =>
    ctx.db
      .query("emailOutbox")
      .withIndex("by_to", (q) => q.eq("to", email))
      .order("desc")
      .first(),
  );
  const code = sent?.subject.match(/\b(\d{6})\b/)?.[1];
  if (code === undefined) {
    throw new Error(`No deletion code emailed to ${email}`);
  }
  return { code, email: sent };
}

describe("users.requestDeletionCode", () => {
  test("emails a code that mentions matchmakers keep their copies, and stores only its hash", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const { code, email } = await requestCode(t, userId, "jane@example.test");

    expect(email?.kind).toBe("account_deletion_code");
    expect(email?.text).toContain("keep their copy");
    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.deletionCode?.attempts).toBe(0);
    expect(user?.deletionCode?.codeHash).not.toContain(code);
    expect(user?.deletionCode?.expiresAt).toBeGreaterThan(Date.now());
  });

  test("asking again replaces the previous code", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const first = await requestCode(t, userId, "jane@example.test");
    const second = await requestCode(t, userId, "jane@example.test");
    expect(first.code).not.toBe(second.code);

    const as = t.withIdentity({ subject: `${userId}|s` });
    expect(
      await as.mutation(api.users.mutations.deleteAccount, {
        code: first.code,
      }),
    ).toEqual({
      kind: "refused",
      message: "That code didn't work. Check it, or start again.",
    });
    expect(
      await as.mutation(api.users.mutations.deleteAccount, {
        code: second.code,
      }),
    ).toEqual({ kind: "deleted" });
    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.deletedAt).toBeDefined();
  });

  test("refuses an account that owns a matchmaker profile, and a signed-out caller", async () => {
    const t = newTest();
    await expect(
      t.mutation(api.users.mutations.requestDeletionCode, {}),
    ).rejects.toThrow("You need to sign in.");

    const ownerId = await seedAccount(t, "owner@example.test");
    await t.run((ctx) =>
      ctx.db.insert("matchmakers", {
        ownerUserId: ownerId,
        username: "owner.matches",
        usernameKey: "ownermatches",
        displayName: "Owner",
      }),
    );
    await expect(
      t
        .withIdentity({ subject: `${ownerId}|s` })
        .mutation(api.users.mutations.requestDeletionCode, {}),
    ).rejects.toThrow("can't be deleted here");

    // Nothing was written or emailed.
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get("users", ownerId),
      emails: (await ctx.db.query("emailOutbox").take(5)).length,
    }));
    expect(state.user?.deletionCode).toBeUndefined();
    expect(state.emails).toBe(0);
  });
});

describe("users.deleteAccount", () => {
  test("marks each linked candidate account_deleted, one event per matchmaker and none across them", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const alpha = await seedMatchmaker(t, "alpha");
    const bravo = await seedMatchmaker(t, "bravo");
    const candidateA = await addCandidate(t, alpha, userId, "joined");
    const candidateB = await addCandidate(t, bravo, userId, "left");
    const { code } = await requestCode(t, userId, "jane@example.test");

    expect(
      await t
        .withIdentity({ subject: `${userId}|s` })
        .mutation(api.users.mutations.deleteAccount, { code }),
    ).toEqual({ kind: "deleted" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get("users", userId),
      a: await ctx.db.get("candidates", candidateA),
      b: await ctx.db.get("candidates", candidateB),
      events: await ctx.db.query("auditEvents").collect(),
    }));
    expect(state.user?.deletedAt).toBeDefined();
    expect(state.user?.deletionCode).toBeUndefined();
    // The row and the name stay: the matchmakers' records still name them.
    expect(state.user?.name).toBe("Jane Doe");
    expect(state.a?.membership).toBe("account_deleted");
    expect(state.b?.membership).toBe("account_deleted");

    const fanned = state.events.filter(
      (event) => event.action === "membership.account_deleted",
    );
    expect(fanned.map((event) => event.matchmakerId).sort()).toEqual(
      [alpha, bravo].sort(),
    );
    // Each copy names only its own tenant's candidate.
    expect(
      fanned.every(
        (event) =>
          event.candidateId ===
          (event.matchmakerId === alpha ? candidateA : candidateB),
      ),
    ).toBe(true);
    // And one account-level event, in no matchmaker's trail.
    const account = state.events.filter(
      (event) => event.action === "account.deleted",
    );
    expect(account).toHaveLength(1);
    expect(account[0].matchmakerId).toBeUndefined();
    expect(account[0].actor).toEqual({
      type: "user",
      userId,
      role: "account",
    });
  });

  test("clears an open invite on a record the account had been re-invited to", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const alpha = await seedMatchmaker(t, "alpha");
    const candidateId = await addCandidate(t, alpha, userId, "left");
    // Re-invited after leaving: still linked to the account, invite open.
    await t.run((ctx) =>
      ctx.db.patch("candidates", candidateId, {
        membership: "invited",
        invite: { tokenHash: "open", expiresAt: Date.now() + 1_000_000 },
      }),
    );
    const { code } = await requestCode(t, userId, "jane@example.test");
    expect(
      await t
        .withIdentity({ subject: `${userId}|s` })
        .mutation(api.users.mutations.deleteAccount, { code }),
    ).toEqual({ kind: "deleted" });

    // The link can't be accepted by an account that no longer exists, so it
    // goes; the matchmaker re-invites, which reissues one.
    const candidate = await t.run((ctx) =>
      ctx.db.get("candidates", candidateId),
    );
    expect(candidate?.membership).toBe("account_deleted");
    expect(candidate?.invite).toBeUndefined();
  });

  test("removes the account's sessions and credentials, keeping other accounts' alone", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const otherId = await seedAccount(t, "other@example.test");
    await t.run(async (ctx) => {
      for (const id of [userId, otherId]) {
        const sessionId = await ctx.db.insert("authSessions", {
          userId: id,
          expirationTime: Date.now() + 1_000_000,
        });
        await ctx.db.insert("authRefreshTokens", {
          sessionId,
          expirationTime: Date.now() + 1_000_000,
        });
        const accountId = await ctx.db.insert("authAccounts", {
          userId: id,
          provider: "email-code",
          providerAccountId: `${id}@example.test`,
        });
        await ctx.db.insert("authVerificationCodes", {
          accountId,
          provider: "email-code",
          code: "hash",
          expirationTime: Date.now() + 1_000_000,
        });
      }
    });
    const { code } = await requestCode(t, userId, "jane@example.test");
    expect(
      await t
        .withIdentity({ subject: `${userId}|s` })
        .mutation(api.users.mutations.deleteAccount, { code }),
    ).toEqual({ kind: "deleted" });

    const left = await t.run(async (ctx) => ({
      sessions: await ctx.db.query("authSessions").collect(),
      refreshTokens: (await ctx.db.query("authRefreshTokens").collect()).length,
      accounts: await ctx.db.query("authAccounts").collect(),
      codes: (await ctx.db.query("authVerificationCodes").collect()).length,
    }));
    expect(left.sessions.map((row) => row.userId)).toEqual([otherId]);
    expect(left.accounts.map((row) => row.userId)).toEqual([otherId]);
    expect(left.refreshTokens).toBe(1);
    expect(left.codes).toBe(1);

    // And the account can no longer be read as signed in.
    expect(
      await t
        .withIdentity({ subject: `${userId}|s` })
        .query(api.users.queries.me),
    ).toBeNull();
  });

  test("refuses a wrong code, and throws the code away after too many tries", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const as = t.withIdentity({ subject: `${userId}|s` });
    const { code } = await requestCode(t, userId, "jane@example.test");
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt < ACCOUNT_DELETION_MAX_ATTEMPTS; attempt++) {
      const result = await as.mutation(api.users.mutations.deleteAccount, {
        code: wrong,
      });
      expect(result).toEqual({
        kind: "refused",
        message: "That code didn't work. Check it, or start again.",
      });
      // The count survives the refusal, which a thrown error would roll back.
      const user = await t.run((ctx) => ctx.db.get("users", userId));
      expect(user?.deletionCode?.attempts).toBe(attempt);
    }
    expect(
      await as.mutation(api.users.mutations.deleteAccount, { code: wrong }),
    ).toEqual({
      kind: "refused",
      message: "Too many wrong codes. Start again to get a new one.",
    });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.deletedAt).toBeUndefined();
    expect(user?.deletionCode).toBeUndefined();
    // Even the right code is no good now: a new one has to be requested.
    expect(
      await as.mutation(api.users.mutations.deleteAccount, { code }),
    ).toEqual({
      kind: "refused",
      message: "That code has expired. Start again to get a new one.",
    });
  });

  test("refuses an expired code, and deleting without asking for one at all", async () => {
    const t = newTest();
    const userId = await seedAccount(t, "jane@example.test");
    const as = t.withIdentity({ subject: `${userId}|s` });
    const expired = {
      kind: "refused",
      message: "That code has expired. Start again to get a new one.",
    };
    // Never asked for a code at all.
    expect(
      await as.mutation(api.users.mutations.deleteAccount, { code: "123456" }),
    ).toEqual(expired);

    const { code } = await requestCode(t, userId, "jane@example.test");
    await t.run((ctx) =>
      ctx.db.patch("users", userId, {
        deletionCode: {
          codeHash: "unused",
          expiresAt: Date.now() - 1,
          attempts: 0,
        },
      }),
    );
    expect(
      await as.mutation(api.users.mutations.deleteAccount, { code }),
    ).toEqual(expired);
    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.deletedAt).toBeUndefined();
  });
});
