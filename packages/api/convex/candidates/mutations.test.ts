/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { deriveInviteToken, hashInviteToken } from "../invites/helpers";
import { INVITE_TTL_MS } from "../invites/rules";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

const SECRET = "test-invite-secret";

beforeEach(() => {
  vi.stubEnv("INVITE_LINK_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "owner@example.test" });
    const stranger = await ctx.db.insert("users", {
      email: "stranger@example.test",
    });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "owner.matches",
      usernameKey: "ownermatches",
      displayName: "Owner",
    });
    return { owner, stranger, matchmakerId };
  });
  return {
    t,
    ...ids,
    asOwner: t.withIdentity({ subject: `${ids.owner}|s` }),
    asStranger: t.withIdentity({ subject: `${ids.stranger}|s` }),
  };
}

describe("candidates.onboard", () => {
  test("writes the candidate, invite, conversation, private history and audit events together", async () => {
    const { t, asOwner, owner, matchmakerId } = await world();
    const result = await asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId,
      email: "  Jane@Example.TEST ",
      name: " Jane   Doe ",
      socialHandles: [
        { platform: "instagram", handle: "@jane.doe" },
        { platform: "whatsapp", handle: "+44 7700 900123" },
        { platform: "instagram", handle: "jane.doe" },
      ],
      importedHistory: "\nJane: hi!\nMe: hello\n",
    });
    expect(result.kind).toBe("created");
    const { candidateId } = result;

    const state = await t.run(async (ctx) => {
      const candidate = await ctx.db.get("candidates", candidateId);
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
        .unique();
      const messages = await ctx.db.query("messages").take(10);
      const events = await ctx.db
        .query("auditEvents")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
        .take(10);
      return { candidate, conversation, messages, events };
    });

    expect(state.candidate).toMatchObject({
      matchmakerId,
      email: "jane@example.test",
      name: "Jane Doe",
      socialHandles: [
        { platform: "instagram", handle: "jane.doe" },
        { platform: "whatsapp", handle: "+447700900123" },
      ],
      membership: "invited",
      status: "active",
    });
    expect(state.candidate?.userId).toBeUndefined();

    // The invite's hash matches the token derived from its nonce, and it
    // expires in 30 days.
    const invite = state.candidate?.invite;
    if (!invite?.nonce) throw new Error("expected a copyable invite");
    const token = await deriveInviteToken(SECRET, candidateId, invite.nonce);
    expect(invite.tokenHash).toBe(await hashInviteToken(token));
    expect(invite.expiresAt - (state.candidate?.membershipChangedAt ?? 0)).toBe(
      INVITE_TTL_MS,
    );

    expect(state.conversation).toMatchObject({
      matchmakerId,
      lastSeq: 1,
      lastPublicSeq: 0,
      matchmakerLastReadSeq: 1,
      candidateLastReadSeq: 0,
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      conversationId: state.conversation?._id,
      seq: 1,
      author: "matchmaker",
      authorUserId: owner,
      visibility: "matchmaker",
      source: "imported",
      body: "Jane: hi!\nMe: hello",
    });

    expect(state.events.map((event) => event.action)).toEqual([
      "candidate.created",
      "invite.created",
      "invite.sent",
    ]);
    for (const event of state.events) {
      expect(event).toMatchObject({
        matchmakerId,
        actor: { type: "user", userId: owner, role: "matchmaker" },
        entityTable: "candidates",
        entityId: candidateId,
      });
    }
    // The token itself is never written anywhere.
    expect(JSON.stringify(state)).not.toContain(token);
  });

  test("without history, the thread starts empty", async () => {
    const { t, asOwner, matchmakerId } = await world();
    const result = await asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId,
      email: "jane@example.test",
      socialHandles: [],
      importedHistory: "   ",
    });
    const state = await t.run(async (ctx) => ({
      conversation: await ctx.db
        .query("conversations")
        .withIndex("by_candidateId", (q) =>
          q.eq("candidateId", result.candidateId),
        )
        .unique(),
      messages: await ctx.db.query("messages").take(10),
    }));
    expect(state.conversation?.lastSeq).toBe(0);
    expect(state.messages).toEqual([]);
  });

  test("an email already in the book, in any case, returns that candidate and writes nothing", async () => {
    const { t, asOwner, matchmakerId } = await world();
    const first = await asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId,
      email: "jane@example.test",
      socialHandles: [],
    });
    // Even after they've left, they're still this matchmaker's candidate.
    await t.run((ctx) =>
      ctx.db.patch("candidates", first.candidateId, { membership: "left" }),
    );

    const second = await asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId,
      email: " JANE@example.test",
      socialHandles: [],
      importedHistory: "more history",
    });
    expect(second).toEqual({
      kind: "duplicate",
      candidateId: first.candidateId,
    });
    const counts = await t.run(async (ctx) => ({
      candidates: (await ctx.db.query("candidates").take(10)).length,
      conversations: (await ctx.db.query("conversations").take(10)).length,
      messages: (await ctx.db.query("messages").take(10)).length,
    }));
    expect(counts).toEqual({ candidates: 1, conversations: 1, messages: 0 });
  });

  test("behaves the same whether or not the email has an account", async () => {
    const { t, asOwner, matchmakerId } = await world();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "member@example.test",
        emailVerificationTime: 1,
      }),
    );
    const withAccount = await asOwner.mutation(
      api.candidates.mutations.onboard,
      { matchmakerId, email: "member@example.test", socialHandles: [] },
    );
    const withoutAccount = await asOwner.mutation(
      api.candidates.mutations.onboard,
      { matchmakerId, email: "nobody@example.test", socialHandles: [] },
    );
    const [a, b] = await t.run(async (ctx) => [
      await ctx.db.get("candidates", withAccount.candidateId),
      await ctx.db.get("candidates", withoutAccount.candidateId),
    ]);
    expect(withAccount.kind).toBe(withoutAccount.kind);
    expect(a?.userId).toBeUndefined();
    expect(a?.membership).toBe(b?.membership);
  });

  test("validates on the server", async () => {
    const { asOwner, matchmakerId } = await world();
    const onboard = (fields: {
      email?: string;
      handle?: string;
      history?: string;
    }) =>
      asOwner.mutation(api.candidates.mutations.onboard, {
        matchmakerId,
        email: fields.email ?? "jane@example.test",
        socialHandles:
          fields.handle === undefined
            ? []
            : [{ platform: "whatsapp", handle: fields.handle }],
        importedHistory: fields.history,
      });
    await expect(onboard({ email: "jane" })).rejects.toThrow(
      "Enter a valid email address.",
    );
    await expect(onboard({ handle: "07700 900123" })).rejects.toThrow(
      "Enter the number with its country code",
    );
    await expect(onboard({ history: "a".repeat(100_001) })).rejects.toThrow(
      "That conversation is too long to import.",
    );
  });

  test("refuses anyone but the matchmaker, and fails clearly without the link secret", async () => {
    const { asOwner, asStranger, matchmakerId } = await world();
    await expect(
      asStranger.mutation(api.candidates.mutations.onboard, {
        matchmakerId,
        email: "jane@example.test",
        socialHandles: [],
      }),
    ).rejects.toThrow("Matchmaker profile not found.");

    vi.stubEnv("INVITE_LINK_SECRET", "");
    await expect(
      asOwner.mutation(api.candidates.mutations.onboard, {
        matchmakerId,
        email: "jane@example.test",
        socialHandles: [],
      }),
    ).rejects.toThrow("Invite links aren't set up on this deployment yet");
  });
});

describe("candidates.leave", () => {
  /** A joined candidate linked to `member`, with one message in the thread. */
  async function joined() {
    const base = await world();
    const memberId = await base.t.run((ctx) =>
      ctx.db.insert("users", {
        email: "member@example.test",
        name: "Mem Ber",
        emailVerificationTime: 1,
      }),
    );
    const candidateId = await base.t.run(async (ctx) => {
      const id = await ctx.db.insert("candidates", {
        matchmakerId: base.matchmakerId,
        userId: memberId,
        email: "member@example.test",
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
      const conversationId = await ctx.db.insert("conversations", {
        matchmakerId: base.matchmakerId,
        candidateId: id,
        lastSeq: 1,
        lastPublicSeq: 1,
        lastMessageAt: 1,
        matchmakerLastReadSeq: 1,
        candidateLastReadSeq: 0,
      });
      await ctx.db.insert("messages", {
        matchmakerId: base.matchmakerId,
        conversationId,
        seq: 1,
        author: "matchmaker",
        visibility: "everyone",
        source: "typed",
        body: "Welcome!",
        sentAt: 1,
      });
      return id;
    });
    return {
      ...base,
      memberId,
      candidateId,
      asMember: base.t.withIdentity({ subject: `${memberId}|s` }),
    };
  }

  test("marks them left with their reason, and audits it as theirs", async () => {
    const { t, asMember, memberId, candidateId, matchmakerId } = await joined();
    await asMember.mutation(api.candidates.mutations.leave, {
      candidateId,
      reason: "  Met someone, thank you!  ",
    });

    const state = await t.run(async (ctx) => ({
      candidate: await ctx.db.get("candidates", candidateId),
      events: await ctx.db
        .query("auditEvents")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
        .collect(),
    }));
    expect(state.candidate?.membership).toBe("left");
    expect(state.candidate?.leaveReason).toBe("Met someone, thank you!");
    expect(state.candidate?.membershipChangedAt).toBeGreaterThan(1);
    const left = state.events.find((e) => e.action === "membership.left");
    expect(left?.matchmakerId).toBe(matchmakerId);
    expect(left?.reason).toBe("Met someone, thank you!");
    expect(left?.actor).toEqual({
      type: "user",
      userId: memberId,
      role: "candidate",
    });
    expect(left?.changes).toEqual([
      { field: "membership", before: '"joined"', after: '"left"' },
    ]);
  });

  test("keeps everything on the matchmaker's side, and closes the candidate's", async () => {
    const { t, asOwner, asMember, candidateId, matchmakerId } = await joined();
    await asMember.mutation(api.candidates.mutations.leave, { candidateId });

    // The matchmaker still reads the thread, and can still write the profile.
    const view = await asOwner.query(api.candidates.queries.conversation, {
      matchmakerId,
      candidateId,
    });
    expect(view?.candidate.membership).toBe("left");
    const thread = await asOwner.query(api.messages.queries.thread, {
      matchmakerId,
      candidateId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(thread.page).toHaveLength(1);
    await asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId,
      candidateId,
      kind: "notes",
      key: "matchmakerTake",
      value: "Left in March. Lovely to work with.",
    });

    // The messages and the profile survive; only the membership moved.
    const counts = await t.run(async (ctx) => ({
      messages: (await ctx.db.query("messages").take(10)).length,
      profiles: (await ctx.db.query("candidateProfiles").take(10)).length,
    }));
    expect(counts).toEqual({ messages: 1, profiles: 1 });

    // Their own side is closed: no thread, and no composer.
    await expect(
      asMember.query(api.messages.queries.candidateThread, {
        candidateId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Conversation not found.");
    await expect(
      asMember.mutation(api.messages.mutations.sendAsCandidate, {
        candidateId,
        body: "Are you still there?",
      }),
    ).rejects.toThrow("Conversation not found.");
  });

  test("leaving twice, and leaving someone else's record, are both refused", async () => {
    const { asMember, asStranger, candidateId } = await joined();
    await asMember.mutation(api.candidates.mutations.leave, { candidateId });
    await expect(
      asMember.mutation(api.candidates.mutations.leave, { candidateId }),
    ).rejects.toThrow("Conversation not found.");
    await expect(
      asStranger.mutation(api.candidates.mutations.leave, { candidateId }),
    ).rejects.toThrow("Conversation not found.");
  });

  test("refuses a reason longer than the limit, writing nothing", async () => {
    const { t, asMember, candidateId } = await joined();
    await expect(
      asMember.mutation(api.candidates.mutations.leave, {
        candidateId,
        reason: "a".repeat(501),
      }),
    ).rejects.toThrow("That's too long.");
    const candidate = await t.run((ctx) =>
      ctx.db.get("candidates", candidateId),
    );
    expect(candidate?.membership).toBe("joined");
  });

  test("the matchmaker can re-invite the same record, continuing one thread", async () => {
    const { t, asOwner, asMember, candidateId, matchmakerId } = await joined();
    await asMember.mutation(api.candidates.mutations.leave, { candidateId });
    await asOwner.mutation(api.invites.mutations.reinvite, {
      matchmakerId,
      candidateId,
    });

    const state = await t.run(async (ctx) => ({
      candidate: await ctx.db.get("candidates", candidateId),
      conversations: (await ctx.db.query("conversations").take(10)).length,
    }));
    expect(state.candidate?.membership).toBe("invited");
    expect(state.candidate?.invite).toBeDefined();
    // One record, one conversation: the history carries on where it left off.
    expect(state.conversations).toBe(1);
  });
});
