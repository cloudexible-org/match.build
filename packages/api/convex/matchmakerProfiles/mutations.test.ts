/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { noteSentMessage } from "./helpers";
import { VOICE_SAMPLE_MESSAGES } from "./rules";

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
    ).toEqual({ voice: null, updatedAt: 0 });
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
      await w.t.run(async (ctx) => await noteSentMessage(ctx, w.matchmakerId));
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
