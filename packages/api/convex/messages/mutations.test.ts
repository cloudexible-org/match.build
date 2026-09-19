/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.stubEnv("INVITE_LINK_SECRET", "test-invite-secret");
  vi.stubEnv("SITE_URL", "https://app.example.test/app");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** A matchmaker, a joined candidate with a private history, and an invited one. */
async function world() {
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(internal.seed.e2e.mutations.scenario, {
    ns: "chattest",
    users: [{ key: "maya" }, { key: "jane" }, { key: "rival" }],
    matchmakers: [
      { key: "book", ownerKey: "maya" },
      { key: "rivalbook", ownerKey: "rival" },
    ],
    candidates: [
      {
        key: "jane",
        matchmakerKey: "book",
        userKey: "jane",
        membership: "joined" as const,
        messages: [
          {
            author: "matchmaker" as const,
            visibility: "matchmaker" as const,
            source: "imported" as const,
            body: "Imported: from Instagram",
          },
        ],
      },
      { key: "invited", matchmakerKey: "book" },
    ],
  });
  const ids = {
    matchmakerId: seeded.matchmakers.book.id as Id<"matchmakers">,
    jane: seeded.candidates.jane.id as Id<"candidates">,
    invited: seeded.candidates.invited.id as Id<"candidates">,
  };
  return {
    t,
    ...ids,
    seeded,
    asMaya: t.withIdentity({ subject: `${seeded.users.maya.id}|s` }),
    asJane: t.withIdentity({ subject: `${seeded.users.jane.id}|s` }),
    asRival: t.withIdentity({ subject: `${seeded.users.rival.id}|s` }),
    conversation: () =>
      t.run(async (ctx) =>
        ctx.db
          .query("conversations")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", ids.jane))
          .unique(),
      ),
  };
}

describe("sending", () => {
  test("both sides append to one sequence and move the counters", async () => {
    const w = await world();
    const first = await w.asMaya.mutation(api.messages.mutations.send, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      body: "  Hello Jane!\r\nHow are you?  ",
    });
    const second = await w.asJane.mutation(
      api.messages.mutations.sendAsCandidate,
      { candidateId: w.jane, body: "Great, thanks" },
    );
    // The seeded private history is seq 1.
    expect([first.seq, second.seq]).toEqual([2, 3]);

    const conversation = await w.conversation();
    expect(conversation).toMatchObject({
      lastSeq: 3,
      lastPublicSeq: 3,
      // Each sender has read their own message; the other side hasn't.
      candidateLastReadSeq: 3,
      matchmakerLastReadSeq: 2,
    });

    const thread = await w.asMaya.query(api.messages.queries.thread, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      paginationOpts: { numItems: 10, cursor: null },
    });
    // Newest first, line breaks kept, ends trimmed.
    expect(thread.page.map((message) => message.body)).toEqual([
      "Great, thanks",
      "Hello Jane!\nHow are you?",
      "Imported: from Instagram",
    ]);
  });

  test("a private message never reaches the candidate's thread", async () => {
    const w = await world();
    await w.asMaya.mutation(api.messages.mutations.send, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      body: "Public hello",
    });
    const thread = await w.asJane.query(api.messages.queries.candidateThread, {
      candidateId: w.jane,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(thread.page.map((message) => message.body)).toEqual([
      "Public hello",
    ]);
    // The private one doesn't even move their unread count.
    const conversation = await w.conversation();
    expect(conversation?.lastPublicSeq).toBe(2);
  });

  test("the composer is closed unless the candidate is a member", async () => {
    const w = await world();
    await expect(
      w.asMaya.mutation(api.messages.mutations.send, {
        matchmakerId: w.matchmakerId,
        candidateId: w.invited,
        body: "Too soon",
      }),
    ).rejects.toThrow("once they accept your invitation");

    await w.t.run((ctx) =>
      ctx.db.patch("candidates", w.jane, { membership: "left" }),
    );
    await expect(
      w.asMaya.mutation(api.messages.mutations.send, {
        matchmakerId: w.matchmakerId,
        candidateId: w.jane,
        body: "Come back",
      }),
    ).rejects.toThrow("aren't a member any more");
    // And the candidate's own side closes with it.
    await expect(
      w.asJane.mutation(api.messages.mutations.sendAsCandidate, {
        candidateId: w.jane,
        body: "Still here?",
      }),
    ).rejects.toThrow("Conversation not found.");
  });

  test("an empty or oversized message is refused", async () => {
    const w = await world();
    const send = (body: string) =>
      w.asMaya.mutation(api.messages.mutations.send, {
        matchmakerId: w.matchmakerId,
        candidateId: w.jane,
        body,
      });
    await expect(send("   \n ")).rejects.toThrow("Write a message first.");
    await expect(send("a".repeat(5001))).rejects.toThrow("too long");
    await expect(send("a".repeat(5000))).resolves.toBeDefined();
  });

  test("nobody else can write to, or read, the thread", async () => {
    const w = await world();
    await expect(
      w.asRival.mutation(api.messages.mutations.send, {
        matchmakerId: w.matchmakerId,
        candidateId: w.jane,
        body: "Hello stranger",
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
    await expect(
      w.asRival.mutation(api.messages.mutations.sendAsCandidate, {
        candidateId: w.jane,
        body: "Hello stranger",
      }),
    ).rejects.toThrow("Conversation not found.");
    await expect(
      w.asRival.query(api.messages.queries.candidateThread, {
        candidateId: w.jane,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Conversation not found.");
  });
});

describe("read markers", () => {
  test("move forward only, and never past what that side can see", async () => {
    const w = await world();
    await w.asJane.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.jane,
      body: "Anyone there?",
    });
    // The seed marks the matchmaker as having read the history it seeded
    // (seq 1), so only Jane's new message is unread.
    expect((await w.conversation())?.matchmakerLastReadSeq).toBe(1);

    await w.asMaya.mutation(api.messages.mutations.markRead, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      seq: 2,
    });
    expect((await w.conversation())?.matchmakerLastReadSeq).toBe(2);

    // A stale marker can't rewind it.
    await w.asMaya.mutation(api.messages.mutations.markRead, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      seq: 1,
    });
    expect((await w.conversation())?.matchmakerLastReadSeq).toBe(2);

    // Nor can a hopeful one run past the last message.
    await w.asMaya.mutation(api.messages.mutations.markRead, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      seq: 999,
    });
    expect((await w.conversation())?.matchmakerLastReadSeq).toBe(2);
  });

  test("the candidate's marker stops at the last message they can see", async () => {
    const w = await world();
    // seq 1 is the matchmaker's private history; seq 2 is public.
    await w.asMaya.mutation(api.messages.mutations.send, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      body: "Public hello",
    });
    await w.asJane.mutation(api.messages.mutations.markReadAsCandidate, {
      candidateId: w.jane,
      seq: 999,
    });
    expect((await w.conversation())?.candidateLastReadSeq).toBe(2);
  });

  test("unread counts drive the workspace list", async () => {
    const w = await world();
    const unread = async () =>
      (
        await w.asMaya.query(api.candidates.queries.list, {
          matchmakerId: w.matchmakerId,
          status: "active",
        })
      ).find((row) => row.candidateId === w.jane)?.unread;

    expect(await unread()).toBe(0);
    await w.asJane.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.jane,
      body: "One",
    });
    await w.asJane.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.jane,
      body: "Two",
    });
    expect(await unread()).toBe(2);

    await w.asMaya.mutation(api.messages.mutations.markRead, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      seq: 3,
    });
    expect(await unread()).toBe(0);

    // Replying counts as reading.
    await w.asJane.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.jane,
      body: "Three",
    });
    await w.asMaya.mutation(api.messages.mutations.send, {
      matchmakerId: w.matchmakerId,
      candidateId: w.jane,
      body: "Sorry, here now",
    });
    expect(await unread()).toBe(0);
  });
});
