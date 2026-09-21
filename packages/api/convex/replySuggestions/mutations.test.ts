/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "maya@example.test" });
    const stranger = await ctx.db.insert("users", {
      email: "nosy@example.test",
    });
    const member = await ctx.db.insert("users", { email: "sam@example.test" });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "maya",
      usernameKey: "maya",
      displayName: "Maya",
    });
    const candidateId = await ctx.db.insert("candidates", {
      matchmakerId,
      userId: member,
      email: "sam@example.test",
      socialHandles: [],
      membership: "joined",
      membershipChangedAt: 1,
      status: "active",
    });
    const conversationId = await ctx.db.insert("conversations", {
      matchmakerId,
      candidateId,
      lastSeq: 0,
      lastPublicSeq: 0,
      lastMessageAt: 1,
      matchmakerLastReadSeq: 0,
      candidateLastReadSeq: 0,
    });
    return {
      owner,
      stranger,
      member,
      matchmakerId,
      candidateId,
      conversationId,
    };
  });

  /** A draft already on offer, as a generation would have left it. */
  async function seedDraft(body: string, throughSeq = 0) {
    return await t.run(
      async (ctx) =>
        await ctx.db.insert("replySuggestions", {
          matchmakerId: ids.matchmakerId,
          candidateId: ids.candidateId,
          conversationId: ids.conversationId,
          body,
          model: "test/model",
          throughSeq,
          status: "ready",
          createdAt: Date.now(),
        }),
    );
  }

  return {
    t,
    ...ids,
    seedDraft,
    asOwner: t.withIdentity({ subject: `${ids.owner}|s` }),
    asStranger: t.withIdentity({ subject: `${ids.stranger}|s` }),
    asMember: t.withIdentity({ subject: `${ids.member}|s` }),
    drafts: () => t.run((ctx) => ctx.db.query("replySuggestions").collect()),
    messages: () => t.run((ctx) => ctx.db.query("messages").collect()),
    conversation: () =>
      t.run((ctx) => ctx.db.get("conversations", ids.conversationId)),
  };
}

describe("recording a generation", () => {
  test("lands the whole batch, and remembers what the agent was told", async () => {
    const w = await world();
    await w.t.mutation(internal.replySuggestions.mutations.record, {
      conversationId: w.conversationId,
      threadId: "thread_1",
      bodies: ["Hello there", "Hi Sam!"],
      model: "test/model",
      throughSeq: 0,
      briefedVoiceAt: 40,
      briefedProfileAt: 90,
    });

    const drafts = await w.drafts();
    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.status === "ready")).toBe(true);

    // The briefing marks are what make the next turn a delta rather than the
    // whole world again.
    const conversation = await w.conversation();
    expect(conversation).toMatchObject({
      agentThreadId: "thread_1",
      agentBriefedSeq: 0,
      agentBriefedVoiceAt: 40,
      agentBriefedProfileAt: 90,
    });
  });

  test("drafts that answer a thread which has moved arrive stale", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("conversations", w.conversationId, { lastSeq: 5 });
    });

    await w.t.mutation(internal.replySuggestions.mutations.record, {
      conversationId: w.conversationId,
      threadId: "thread_1",
      bodies: ["Written for seq 3"],
      model: "test/model",
      throughSeq: 3,
      briefedVoiceAt: 0,
      briefedProfileAt: 0,
    });

    const drafts = await w.drafts();
    expect(drafts[0]?.status).toBe("stale");
    // The agent really was told, so the marks still advance.
    expect((await w.conversation())?.agentBriefedSeq).toBe(3);
  });

  test("a generation that produced nothing still frees the debounce slot", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("conversations", w.conversationId, {
        draftJobId: undefined,
      });
    });
    await w.t.mutation(internal.replySuggestions.mutations.record, {
      conversationId: w.conversationId,
      threadId: "thread_1",
      bodies: [],
      model: "test/model",
      throughSeq: 0,
      briefedVoiceAt: 0,
      briefedProfileAt: 0,
    });
    expect(await w.drafts()).toHaveLength(0);
    expect((await w.conversation())?.draftJobId).toBeUndefined();
  });
});

describe("a new message", () => {
  test("makes the drafts on offer stale, and schedules another run", async () => {
    const w = await world();
    await w.seedDraft("Old news");

    await w.asMember.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.candidateId,
      body: "One more thing —",
    });

    // A draft written before the message is not an answer to it.
    expect((await w.drafts())[0]?.status).toBe("stale");
    expect((await w.conversation())?.draftJobId).toBeDefined();
  });

  test("a burst replaces the pending job rather than queuing four", async () => {
    const w = await world();
    for (const body of ["One", "Two", "Three"]) {
      await w.asMember.mutation(api.messages.mutations.sendAsCandidate, {
        candidateId: w.candidateId,
        body,
      });
    }
    const scheduled = await w.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.state.kind === "pending",
      ),
    );
    const drafting = scheduled.filter((job) =>
      job.name.includes("replySuggestions"),
    );
    expect(drafting).toHaveLength(1);
  });

  test("the matchmaker's own reply also retires the drafts", async () => {
    const w = await world();
    await w.seedDraft("Never sent");

    await w.asOwner.mutation(api.messages.mutations.send, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      body: "Said it myself.",
    });

    expect((await w.drafts())[0]?.status).toBe("stale");
  });
});

describe("sending a draft", () => {
  test("goes out as a message, marked as having started as one", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Lovely to hear from you.");

    await w.asOwner.mutation(api.replySuggestions.mutations.send, {
      matchmakerId: w.matchmakerId,
      suggestionId: draftId,
    });

    const messages = await w.messages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      author: "matchmaker",
      visibility: "everyone",
      source: "ai_suggestion",
      body: "Lovely to hear from you.",
    });

    const drafts = await w.drafts();
    expect(drafts[0]?.status).toBe("sent");
    expect(drafts[0]?.sentMessageId).toBe(messages[0]?._id);
  });

  test("an edit is what gets sent, and it is still a suggestion", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Lovely to hear from you.");

    await w.asOwner.mutation(api.replySuggestions.mutations.send, {
      matchmakerId: w.matchmakerId,
      suggestionId: draftId,
      body: "Lovely to hear from you, Sam!",
    });

    const messages = await w.messages();
    expect(messages[0]?.body).toBe("Lovely to hear from you, Sam!");
    expect(messages[0]?.source).toBe("ai_suggestion");
  });

  test("the alternatives they passed over go stale, not the one they sent", async () => {
    const w = await world();
    const sent = await w.seedDraft("This one");
    await w.seedDraft("Not this one");

    await w.asOwner.mutation(api.replySuggestions.mutations.send, {
      matchmakerId: w.matchmakerId,
      suggestionId: sent,
    });

    const drafts = await w.drafts();
    expect(drafts.find((d) => d._id === sent)?.status).toBe("sent");
    expect(drafts.find((d) => d._id !== sent)?.status).toBe("stale");
  });

  test("a draft cannot be sent twice", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Once");
    await w.asOwner.mutation(api.replySuggestions.mutations.send, {
      matchmakerId: w.matchmakerId,
      suggestionId: draftId,
    });
    await expect(
      w.asOwner.mutation(api.replySuggestions.mutations.send, {
        matchmakerId: w.matchmakerId,
        suggestionId: draftId,
      }),
    ).rejects.toThrow(/already been answered/);
  });

  test("refused once they are no longer a member", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Too late");
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidateId, { membership: "left" });
    });
    await expect(
      w.asOwner.mutation(api.replySuggestions.mutations.send, {
        matchmakerId: w.matchmakerId,
        suggestionId: draftId,
      }),
    ).rejects.toThrow(/aren't a member/);
  });

  test("an empty edit is refused rather than sent", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Something");
    await expect(
      w.asOwner.mutation(api.replySuggestions.mutations.send, {
        matchmakerId: w.matchmakerId,
        suggestionId: draftId,
        body: "   ",
      }),
    ).rejects.toThrow();
    expect(await w.messages()).toHaveLength(0);
  });
});

describe("dismissing a draft", () => {
  test("answers that one and leaves the others on offer", async () => {
    const w = await world();
    const gone = await w.seedDraft("No thanks");
    await w.seedDraft("Still here");

    await w.asOwner.mutation(api.replySuggestions.mutations.dismiss, {
      matchmakerId: w.matchmakerId,
      suggestionId: gone,
    });

    const drafts = await w.drafts();
    expect(drafts.find((d) => d._id === gone)?.status).toBe("dismissed");
    expect(drafts.find((d) => d._id !== gone)?.status).toBe("ready");
  });
});

describe("tenancy", () => {
  test("another matchmaker's account cannot read, send or dismiss", async () => {
    const w = await world();
    const draftId = await w.seedDraft("Not yours");

    await expect(
      w.asStranger.query(api.replySuggestions.queries.forCandidate, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
      }),
    ).rejects.toThrow();
    await expect(
      w.asStranger.mutation(api.replySuggestions.mutations.send, {
        matchmakerId: w.matchmakerId,
        suggestionId: draftId,
      }),
    ).rejects.toThrow();
    await expect(
      w.asStranger.mutation(api.replySuggestions.mutations.dismiss, {
        matchmakerId: w.matchmakerId,
        suggestionId: draftId,
      }),
    ).rejects.toThrow();
  });

  test("the candidate they are about cannot see them", async () => {
    const w = await world();
    await w.seedDraft("Drafted about you");
    await expect(
      w.asMember.query(api.replySuggestions.queries.forCandidate, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
      }),
    ).rejects.toThrow();
  });

  test("the matchmaker sees only what is still on offer", async () => {
    const w = await world();
    await w.seedDraft("Ready");
    const gone = await w.seedDraft("Dismissed");
    await w.asOwner.mutation(api.replySuggestions.mutations.dismiss, {
      matchmakerId: w.matchmakerId,
      suggestionId: gone,
    });

    const open = await w.asOwner.query(
      api.replySuggestions.queries.forCandidate,
      { matchmakerId: w.matchmakerId, candidateId: w.candidateId },
    );
    expect(open.map((draft) => draft.body)).toEqual(["Ready"]);
  });
});

describe("the agent being off", () => {
  test("a drafting run with no agent configured does nothing, quietly", async () => {
    const w = await world();
    // No `aiAgentSettings` row at all, which is the state of every deployment
    // that has not been seeded — and of the e2e backend, which has no gateway.
    await w.t.action(internal.replySuggestions.actions.draft, {
      conversationId: w.conversationId,
    });
    expect(await w.drafts()).toHaveLength(0);
    expect((await w.conversation())?.agentThreadId).toBeUndefined();
  });
});
