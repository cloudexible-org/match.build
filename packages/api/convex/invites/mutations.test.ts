/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { hashInviteToken } from "./helpers";
import { INVITE_TTL_MS } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("INVITE_LINK_SECRET", "test-invite-secret");
  vi.stubEnv("SITE_URL", "https://app.example.test/app");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      email: "owner@example.test",
      emailVerificationTime: 1,
    });
    const jane = await ctx.db.insert("users", {
      email: "jane@example.test",
      name: "Jane",
      emailVerificationTime: 1,
    });
    const other = await ctx.db.insert("users", {
      email: "other@example.test",
      name: "Other",
      emailVerificationTime: 1,
    });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "owner.matches",
      usernameKey: "ownermatches",
      displayName: "Maya's Matches",
    });
    return { owner, jane, other, matchmakerId };
  });
  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: `${userId}|s` });
  const asOwner = as(ids.owner);
  const onboard = async (email = "jane@example.test") => {
    const result = await asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId: ids.matchmakerId,
      email,
      socialHandles: [],
    });
    return result.candidateId;
  };
  const token = (candidateId: Id<"candidates">) =>
    asOwner.query(api.invites.queries.token, {
      matchmakerId: ids.matchmakerId,
      candidateId,
    });
  const candidate = (candidateId: Id<"candidates">) =>
    t.run((ctx) => ctx.db.get("candidates", candidateId));
  const actions = (candidateId: Id<"candidates">) =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .take(50)
      ).map((event) => event.action),
    );
  return { t, ...ids, as, asOwner, onboard, token, candidate, actions };
}

type T = Awaited<ReturnType<typeof world>>["t"];

/** Runs the scheduled sends (but not the expiry, days away). */
async function runSends(t: T) {
  vi.advanceTimersByTime(1000);
  await t.finishInProgressScheduledFunctions();
}

async function outbox(t: T, to: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("emailOutbox")
      .withIndex("by_to", (q) => q.eq("to", to))
      .take(10),
  );
}

describe("the invite email", () => {
  test("goes to the invited address with a working link, and never after the invite is gone", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    await runSends(w.t);

    const [email] = await outbox(w.t, "jane@example.test");
    expect(email).toMatchObject({
      kind: "invite",
      subject: "Maya's Matches invited you to Matchmaker",
    });
    const link = email?.text.match(
      /https:\/\/app\.example\.test\/app\/invite\/([A-Za-z0-9_-]{43})/,
    );
    expect(link?.[1]).toBe(await w.token(candidateId));

    // A resend scheduled, then revoked before it ran, sends nothing.
    await w.asOwner.mutation(api.invites.mutations.resend, {
      matchmakerId: w.matchmakerId,
      candidateId,
    });
    await w.asOwner.mutation(api.invites.mutations.revoke, {
      matchmakerId: w.matchmakerId,
      candidateId,
    });
    await runSends(w.t);
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(1);
  });
});

describe("accepting", () => {
  test("by link works for any account, links it, and uses up the link", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const token = (await w.token(candidateId)) ?? "";
    const asOther = w.as(w.other);

    expect(await asOther.query(api.invites.queries.preview, { token })).toEqual(
      {
        state: "open",
        matchmakerDisplayName: "Maya's Matches",
        problem: null,
      },
    );
    expect(
      await asOther.mutation(api.invites.mutations.accept, { token }),
    ).toEqual({ matchmakerUsername: "owner.matches" });

    const joined = await w.candidate(candidateId);
    expect(joined).toMatchObject({ userId: w.other, membership: "joined" });
    expect(joined?.invite).toBeUndefined();
    expect((await w.actions(candidateId)).at(-1)).toBe("invite.accepted");

    // The owner sees who accepted.
    const view = await w.asOwner.query(api.candidates.queries.conversation, {
      matchmakerId: w.matchmakerId,
      candidateId,
    });
    expect(view?.candidate).toMatchObject({
      name: "Other",
      acceptedAs: "other@example.test",
    });

    // Single use.
    await expect(
      w.as(w.jane).mutation(api.invites.mutations.accept, { token }),
    ).rejects.toThrow("This invitation isn't valid any more.");
    expect(await asOther.query(api.invites.queries.preview, { token })).toEqual(
      { state: "invalid" },
    );
  });

  test("from the home page only for the verified invited address", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    await expect(
      w.as(w.other).mutation(api.invites.mutations.accept, { candidateId }),
    ).rejects.toThrow("This invitation isn't valid any more.");
    await w.t.run((ctx) =>
      ctx.db.patch("users", w.jane, { emailVerificationTime: undefined }),
    );
    await expect(
      w.as(w.jane).mutation(api.invites.mutations.accept, { candidateId }),
    ).rejects.toThrow("This invitation isn't valid any more.");
    await w.t.run((ctx) =>
      ctx.db.patch("users", w.jane, { emailVerificationTime: 1 }),
    );
    await w.as(w.jane).mutation(api.invites.mutations.accept, { candidateId });
    expect((await w.candidate(candidateId))?.membership).toBe("joined");
  });

  test("is refused, leaving the invite open, for the owner or someone already there", async () => {
    const w = await world();
    const first = await w.onboard("first@example.test");
    const second = await w.onboard("second@example.test");
    const firstToken = (await w.token(first)) ?? "";
    const secondToken = (await w.token(second)) ?? "";

    await expect(
      w.asOwner.mutation(api.invites.mutations.accept, { token: firstToken }),
    ).rejects.toThrow("This invitation is from your own matchmaker profile.");
    await expect(
      w.asOwner.mutation(api.invites.mutations.decline, { token: firstToken }),
    ).rejects.toThrow("This invitation is from your own matchmaker profile.");

    const asJane = w.as(w.jane);
    await asJane.mutation(api.invites.mutations.accept, { token: firstToken });
    expect(
      await asJane.query(api.invites.queries.preview, { token: secondToken }),
    ).toMatchObject({ state: "open", problem: "already_member" });
    await expect(
      asJane.mutation(api.invites.mutations.accept, { token: secondToken }),
    ).rejects.toThrow("You're already a member of this matchmaker.");

    // Once Jane has left, her old record still blocks a second one.
    await w.t.run((ctx) =>
      ctx.db.patch("candidates", first, { membership: "left" }),
    );
    await expect(
      asJane.mutation(api.invites.mutations.accept, { token: secondToken }),
    ).rejects.toThrow("You already have a history with this matchmaker.");
    expect((await w.candidate(second))?.invite).toBeDefined();
  });

  test("is refused once the invite has expired, even before the job runs", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const token = (await w.token(candidateId)) ?? "";
    vi.setSystemTime(Date.now() + INVITE_TTL_MS);
    await expect(
      w.as(w.jane).mutation(api.invites.mutations.accept, { token }),
    ).rejects.toThrow("This invitation isn't valid any more.");
  });
});

describe("declining and re-inviting", () => {
  test("decline clears the invite; re-invite issues a new link and email", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const oldToken = (await w.token(candidateId)) ?? "";
    await runSends(w.t);

    await w
      .as(w.jane)
      .mutation(api.invites.mutations.decline, { token: oldToken });
    const declined = await w.candidate(candidateId);
    expect(declined?.membership).toBe("declined");
    expect(declined?.invite).toBeUndefined();
    expect(declined?.userId).toBeUndefined();

    await w.asOwner.mutation(api.invites.mutations.reinvite, {
      matchmakerId: w.matchmakerId,
      candidateId,
    });
    await runSends(w.t);
    const newToken = await w.token(candidateId);
    expect(newToken).not.toBe(oldToken);
    expect((await w.candidate(candidateId))?.membership).toBe("invited");
    expect(await w.actions(candidateId)).toEqual([
      "candidate.created",
      "invite.created",
      "invite.sent",
      "invite.declined",
      "membership.reinvited",
      "invite.created",
      "invite.sent",
    ]);
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(2);
    await expect(
      w.as(w.jane).mutation(api.invites.mutations.accept, { token: oldToken }),
    ).rejects.toThrow("This invitation isn't valid any more.");
  });

  test("re-invite is refused while an invite is open or for a member", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const args = { matchmakerId: w.matchmakerId, candidateId };
    await expect(
      w.asOwner.mutation(api.invites.mutations.reinvite, args),
    ).rejects.toThrow("Their invitation is still open.");
    await w.as(w.jane).mutation(api.invites.mutations.accept, { candidateId });
    await expect(
      w.asOwner.mutation(api.invites.mutations.reinvite, args),
    ).rejects.toThrow("They're already a member.");
  });
});

describe("managing an open invite", () => {
  test("resend is limited to three emails a day, counting the first", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const args = { matchmakerId: w.matchmakerId, candidateId };
    await w.asOwner.mutation(api.invites.mutations.resend, args);
    await w.asOwner.mutation(api.invites.mutations.resend, args);
    await expect(
      w.asOwner.mutation(api.invites.mutations.resend, args),
    ).rejects.toThrow("This invitation has been emailed 3 times today.");

    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);
    await w.asOwner.mutation(api.invites.mutations.resend, args);
    expect((await w.candidate(candidateId))?.invite?.lastSentAt).toBe(
      Date.now(),
    );
  });

  test("revoke kills the link at once", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const token = (await w.token(candidateId)) ?? "";
    await w.asOwner.mutation(api.invites.mutations.revoke, {
      matchmakerId: w.matchmakerId,
      candidateId,
    });
    expect(
      await w.as(w.jane).query(api.invites.queries.preview, { token }),
    ).toEqual({ state: "invalid" });
    expect((await w.actions(candidateId)).at(-1)).toBe("invite.revoked");
  });

  test("change email moves the invite to a new link at the new address", async () => {
    const w = await world();
    const candidateId = await w.onboard("jane@exmaple.test");
    await w.onboard("taken@example.test");
    const oldToken = (await w.token(candidateId)) ?? "";
    const args = { matchmakerId: w.matchmakerId, candidateId };

    const duplicate = await w.asOwner.mutation(
      api.invites.mutations.changeEmail,
      { ...args, email: "TAKEN@example.test" },
    );
    expect(duplicate.kind).toBe("duplicate");

    await w.asOwner.mutation(api.invites.mutations.changeEmail, {
      ...args,
      email: " Jane@Example.test ",
    });
    await runSends(w.t);
    const updated = await w.candidate(candidateId);
    expect(updated?.email).toBe("jane@example.test");
    expect(updated?.invite?.tokenHash).not.toBe(
      await hashInviteToken(oldToken),
    );
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(1);
    expect(
      await w
        .as(w.jane)
        .query(api.invites.queries.preview, { token: oldToken }),
    ).toEqual({ state: "invalid" });
    // The home page now offers it to the corrected address.
    expect(
      await w.as(w.jane).query(api.invites.queries.preview, { candidateId }),
    ).toMatchObject({ state: "open" });
  });

  test("only the owner can manage it", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    await expect(
      w.as(w.other).mutation(api.invites.mutations.revoke, {
        matchmakerId: w.matchmakerId,
        candidateId,
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });
});

describe("expiry", () => {
  test("the scheduled job clears the invite after 30 days, as the system", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    await w.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await w.candidate(candidateId))?.invite).toBeUndefined();
    expect((await w.actions(candidateId)).at(-1)).toBe("invite.expired");
    const expired = await w.t.run(async (ctx) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .take(10)
      ).find((event) => event.action === "invite.expired"),
    );
    expect(expired?.actor).toEqual({ type: "system", job: "invite_expiry" });
  });

  test("an expiry scheduled for a replaced invite does nothing", async () => {
    const w = await world();
    const candidateId = await w.onboard();
    const before = await w.candidate(candidateId);
    await w.t.mutation(internal.invites.mutations.expire, {
      candidateId,
      tokenHash: "not-the-current-hash",
    });
    expect((await w.candidate(candidateId))?.invite).toEqual(before?.invite);
  });
});
