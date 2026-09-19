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
