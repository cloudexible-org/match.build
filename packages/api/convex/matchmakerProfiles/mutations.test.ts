/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { agentWriteMode } from "../profiles/rules";
import schema from "../schema";
import { noteSentMessage } from "./helpers";
import { PRACTICE_FIELDS, VOICE_FIELD, VOICE_SAMPLE_MESSAGES } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

async function world() {
  const t = convexTest(schema, modules);
  const { owner, stranger, matchmakerId } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "maya@example.test" });
    const stranger = await ctx.db.insert("users", {
      email: "nosy@example.test",
    });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "maya",
      usernameKey: "maya",
      displayName: "Maya",
    });
    return { owner, stranger, matchmakerId };
  });
  return {
    t,
    owner,
    matchmakerId,
    asOwner: t.withIdentity({ subject: `${owner}|s` }),
    asStranger: t.withIdentity({ subject: `${stranger}|s` }),
    voice: async () =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("matchmakerProfiles")
            .withIndex("by_matchmakerId", (q) =>
              q.eq("matchmakerId", matchmakerId),
            )
            .unique(),
        )
      )?.voice,
    profile: () =>
      t.run((ctx) =>
        ctx.db
          .query("matchmakerProfiles")
          .withIndex("by_matchmakerId", (q) =>
            q.eq("matchmakerId", matchmakerId),
          )
          .unique(),
      ),
    events: () => t.run((ctx) => ctx.db.query("auditEvents").collect()),
  };
}

const AGENT = { agent: "voice_profile" as const, model: "test/model" };

describe("matchmakerProfiles.setVoice", () => {
  test("stores it, stamps it, and audits it against their own profile", async () => {
    const w = await world();
    await w.asOwner.mutation(api.matchmakerProfiles.mutations.setVoice, {
      matchmakerId: w.matchmakerId,
      value: "  Warm but brief.\r\nNo exclamation marks.  ",
    });

    expect(await w.voice()).toMatchObject({
      value: "Warm but brief.\nNo exclamation marks.",
      source: "matchmaker",
      updatedByUserId: w.owner,
    });

    const events = await w.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      matchmakerId: w.matchmakerId,
      action: "matchmaker_profile.updated",
      entityTable: "matchmakerProfiles",
      changes: [{ field: "voice" }],
    });
    // Their own profile, not anyone's book.
    expect(events[0]?.candidateId).toBeUndefined();
  });

  test("a voice longer than the limit is refused", async () => {
    const w = await world();
    await expect(
      w.asOwner.mutation(api.matchmakerProfiles.mutations.setVoice, {
        matchmakerId: w.matchmakerId,
        value: "a".repeat(4_001),
      }),
    ).rejects.toThrow("Voice is at most 4,000 characters.");
  });

  test("nobody else can read it or write it", async () => {
    const w = await world();
    await expect(
      w.asStranger.query(api.matchmakerProfiles.queries.get, {
        matchmakerId: w.matchmakerId,
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
    await expect(
      w.asStranger.mutation(api.matchmakerProfiles.mutations.setVoice, {
        matchmakerId: w.matchmakerId,
        value: "Mine now.",
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });

  test("an unwritten profile reads as empty rather than missing", async () => {
    const w = await world();
    expect(
      await w.asOwner.query(api.matchmakerProfiles.queries.get, {
        matchmakerId: w.matchmakerId,
      }),
    ).toEqual({
      voice: null,
      whoYouWorkWith: null,
      howYouWork: null,
      whatYouDont: null,
      updatedAt: 0,
    });
  });
});

describe("the voice-profile agent", () => {
  test("only ever drafts — their voice is theirs", async () => {
    const w = await world();
    const outcome = await w.t.mutation(
      internal.matchmakerProfiles.mutations.applyAgentVoice,
      { matchmakerId: w.matchmakerId, ...AGENT, value: "Brisk and dry." },
    );
    expect(outcome).toBe("suggested");

    const voice = await w.voice();
    expect(voice?.value).toBe("");
    expect(voice?.pending?.value).toBe("Brisk and dry.");
    expect((await w.events())[0]).toMatchObject({
      actor: { type: "agent", agent: "voice_profile", model: "test/model" },
      action: "matchmaker_profile.suggested",
    });
  });

  test("a draft over the limit is dropped rather than thrown", async () => {
    const w = await world();
    expect(
      await w.t.mutation(
        internal.matchmakerProfiles.mutations.applyAgentVoice,
        {
          matchmakerId: w.matchmakerId,
          ...AGENT,
          value: "a".repeat(4_001),
        },
      ),
    ).toBe("refused");
    expect(await w.events()).toHaveLength(0);
  });

  test("accepting a draft records it as approved, not as theirs", async () => {
    const w = await world();
    await w.t.mutation(internal.matchmakerProfiles.mutations.applyAgentVoice, {
      matchmakerId: w.matchmakerId,
      ...AGENT,
      value: "Brisk and dry.",
    });
    await w.asOwner.mutation(
      api.matchmakerProfiles.mutations.resolveVoiceSuggestion,
      { matchmakerId: w.matchmakerId, accept: true },
    );

    const voice = await w.voice();
    expect(voice).toMatchObject({
      value: "Brisk and dry.",
      source: "agent_approved",
      updatedByUserId: w.owner,
    });
    expect(voice?.pending).toBeUndefined();
    expect((await w.events())[1]?.action).toBe(
      "matchmaker_profile.suggestion_accepted",
    );
  });

  test("dismissing a draft on an empty voice leaves nothing behind", async () => {
    const w = await world();
    await w.t.mutation(internal.matchmakerProfiles.mutations.applyAgentVoice, {
      matchmakerId: w.matchmakerId,
      ...AGENT,
      value: "Brisk and dry.",
    });
    await w.asOwner.mutation(
      api.matchmakerProfiles.mutations.resolveVoiceSuggestion,
      { matchmakerId: w.matchmakerId, accept: false },
    );
    expect(await w.voice()).toBeUndefined();
    expect((await w.events())[1]?.action).toBe(
      "matchmaker_profile.suggestion_rejected",
    );
  });
});

describe("the voice agent's cadence (prd/phase-2.md §4.1C)", () => {
  /** Sends one matchmaker message the way `messages.send` does. */
  async function sent(w: Awaited<ReturnType<typeof world>>, times: number) {
    for (let i = 0; i < times; i++) {
      await w.t.run(
        async (ctx) => await noteSentMessage(ctx, w.matchmakerId, {}),
      );
    }
  }

  const profile = (w: Awaited<ReturnType<typeof world>>) =>
    w.t.run((ctx) =>
      ctx.db
        .query("matchmakerProfiles")
        .withIndex("by_matchmakerId", (q) =>
          q.eq("matchmakerId", w.matchmakerId),
        )
        .unique(),
    );

  const scheduled = (w: Awaited<ReturnType<typeof world>>) =>
    w.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

  test("counts every message they send", async () => {
    const w = await world();
    await sent(w, 3);
    expect((await profile(w))?.sentMessages).toBe(3);
  });

  test("counts nothing from a conversation with voice switched off", async () => {
    const w = await world();
    await w.t.run(
      async (ctx) => await noteSentMessage(ctx, w.matchmakerId, {}),
    );
    // Explicitly off, and derived off because the master switch is.
    for (const conversation of [{ voiceOff: true }, { aiOff: true }]) {
      await w.t.run(
        async (ctx) => await noteSentMessage(ctx, w.matchmakerId, conversation),
      );
    }
    // Only the first one. Counting the others would wake the agent early over
    // a window `voiceContext` is about to filter most of back out.
    expect((await profile(w))?.sentMessages).toBe(1);
  });

  test("does not wake the agent before a full sample", async () => {
    const w = await world();
    await sent(w, VOICE_SAMPLE_MESSAGES - 1);
    expect(await scheduled(w)).toHaveLength(0);
    expect((await profile(w))?.voiceReadThrough).toBeUndefined();
  });

  test("wakes it once the sample is there, and not twice", async () => {
    const w = await world();
    await sent(w, VOICE_SAMPLE_MESSAGES);
    expect(await scheduled(w)).toHaveLength(1);

    // The mark moves with the run, so the next message is one of the *next*
    // sample rather than another trigger. A trigger of "N in total" would
    // fire here on every message from the twentieth onwards.
    await sent(w, 1);
    expect(await scheduled(w)).toHaveLength(1);
    expect((await profile(w))?.voiceReadThrough).toBe(VOICE_SAMPLE_MESSAGES);
  });

  test("wakes it again a whole sample later", async () => {
    const w = await world();
    await sent(w, VOICE_SAMPLE_MESSAGES * 2);
    expect(await scheduled(w)).toHaveLength(2);
    expect((await profile(w))?.voiceReadThrough).toBe(
      VOICE_SAMPLE_MESSAGES * 2,
    );
  });
});

describe("the matchmaker's practice fields", () => {
  test("no agent may write one, whatever the field already holds", () => {
    // The guarantee, at its source: `agentWriteMode` refuses a `matchmaker`
    // field outright rather than turning the write into a proposal, for an
    // untouched field and for one the matchmaker has already filled in. Voice
    // is `suggest` and sits beside them, which is the contrast worth pinning.
    for (const field of PRACTICE_FIELDS) {
      expect(field.policy).toBe("matchmaker");
      for (const existing of [null, "matchmaker", "agent"] as const) {
        expect(agentWriteMode(field.policy, existing)).toBe("refuse");
      }
    }
    expect(agentWriteMode(VOICE_FIELD.policy, null)).toBe("suggest");
  });

  test("the matchmaker writes one, and the trail keeps what it replaced", async () => {
    const w = await world();
    await w.asOwner.mutation(
      api.matchmakerProfiles.mutations.setPracticeField,
      {
        matchmakerId: w.matchmakerId,
        field: "whoYouWorkWith",
        value: "  British Indian families in London.\r\nMostly 28–40.  ",
      },
    );
    expect((await w.profile())?.whoYouWorkWith).toMatchObject({
      value: "British Indian families in London.\nMostly 28–40.",
      source: "matchmaker",
      updatedByUserId: w.owner,
    });

    await w.asOwner.mutation(
      api.matchmakerProfiles.mutations.setPracticeField,
      {
        matchmakerId: w.matchmakerId,
        field: "whoYouWorkWith",
        value: "Second marriages only.",
      },
    );
    const events = await w.events();
    expect(events[1]).toMatchObject({
      action: "matchmaker_profile.updated",
      // JSON-encoded, as the trail stores every value: it holds fields of
      // several types and a string is not the only one.
      changes: [
        {
          field: "whoYouWorkWith",
          before: JSON.stringify(
            "British Indian families in London.\nMostly 28–40.",
          ),
          after: JSON.stringify("Second marriages only."),
        },
      ],
    });
  });

  test("each field is stored on its own, so saving one cannot lose another", async () => {
    const w = await world();
    for (const field of [
      "whoYouWorkWith",
      "howYouWork",
      "whatYouDont",
    ] as const) {
      await w.asOwner.mutation(
        api.matchmakerProfiles.mutations.setPracticeField,
        { matchmakerId: w.matchmakerId, field, value: `${field} value` },
      );
    }
    const profile = await w.profile();
    expect(profile?.whoYouWorkWith?.value).toBe("whoYouWorkWith value");
    expect(profile?.howYouWork?.value).toBe("howYouWork value");
    expect(profile?.whatYouDont?.value).toBe("whatYouDont value");
  });

  test("another matchmaker's account cannot write one", async () => {
    const w = await world();
    await expect(
      w.asStranger.mutation(api.matchmakerProfiles.mutations.setPracticeField, {
        matchmakerId: w.matchmakerId,
        field: "whatYouDont",
        value: "anything",
      }),
    ).rejects.toThrow();
    expect((await w.profile())?.whatYouDont).toBeUndefined();
  });

  test("a value past the limit is refused", async () => {
    const w = await world();
    await expect(
      w.asOwner.mutation(api.matchmakerProfiles.mutations.setPracticeField, {
        matchmakerId: w.matchmakerId,
        field: "howYouWork",
        value: "x".repeat(1_501),
      }),
    ).rejects.toThrow();
  });
});
