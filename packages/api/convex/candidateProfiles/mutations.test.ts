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
  const { owner, stranger, matchmakerId, candidateId } = await t.run(
    async (ctx) => {
      const owner = await ctx.db.insert("users", {
        email: "maya@example.test",
      });
      const stranger = await ctx.db.insert("users", {
        email: "nosy@example.test",
      });
      const matchmakerId = await ctx.db.insert("matchmakers", {
        ownerUserId: owner,
        username: "maya",
        usernameKey: "maya",
        displayName: "Maya",
      });
      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        email: "jane@example.test",
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
      return { owner, stranger, matchmakerId, candidateId };
    },
  );
  return {
    t,
    owner,
    matchmakerId,
    candidateId,
    asOwner: t.withIdentity({ subject: `${owner}|s` }),
    asStranger: t.withIdentity({ subject: `${stranger}|s` }),
    profile: () =>
      t.run(async (ctx) =>
        ctx.db
          .query("candidateProfiles")
          .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
          .unique(),
      ),
    events: () => t.run((ctx) => ctx.db.query("auditEvents").collect()),
  };
}

const AGENT = { agent: "candidate_profile" as const, model: "test/model" };

describe("the matchmaker's own edits", () => {
  test("a value is normalised, stamped and audited", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "partnerAgeRange",
      value: " 28 - 36 ",
    });

    const profile = await w.profile();
    expect(profile?.facts.partnerAgeRange).toMatchObject({
      value: "28-36",
      source: "matchmaker",
      updatedByUserId: w.owner,
    });

    const events = await w.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "profile.updated",
      entityTable: "candidateProfiles",
      changes: [{ field: "facts.partnerAgeRange", after: '"28-36"' }],
    });
  });

  test("a value the registry refuses never reaches the row", async () => {
    const w = await world();
    await expect(
      w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "wantsKids",
        value: "yes please",
      }),
    ).rejects.toThrow("one of: yes, no, maybe, open");
    expect(await w.profile()).toBeNull();
  });

  test("saving the same value again records nothing", async () => {
    const w = await world();
    const set = () =>
      w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "notes",
        key: "idealWeekend",
        value: "Long walks.",
      });
    await set();
    await set();
    expect(await w.events()).toHaveLength(1);
  });

  test("clearing removes the entry and says what it was", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "heightCm",
      value: "178",
    });
    await w.asOwner.mutation(api.candidateProfiles.mutations.clearEntryValue, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "heightCm",
    });

    const profile = await w.profile();
    expect(profile?.facts.heightCm).toBeUndefined();
    const events = await w.events();
    expect(events[1]).toMatchObject({
      action: "profile.updated",
      changes: [{ field: "facts.heightCm", before: '"178"' }],
    });
    expect(events[1]?.changes?.[0]?.after).toBeUndefined();
  });

  test("another matchmaker cannot read or write the profile", async () => {
    const w = await world();
    await expect(
      w.asStranger.query(api.candidateProfiles.queries.get, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
    await expect(
      w.asStranger.mutation(api.candidateProfiles.mutations.setEntry, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "heightCm",
        value: "180",
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });
});

describe("the agent's write path", () => {
  test("an `agent` field is written straight in, with its quote", async () => {
    const w = await world();
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [
          {
            kind: "facts",
            key: "wantsKids",
            value: "Yes",
            confidence: 0.9,
            sourceQuote: "I definitely want kids.",
          },
        ],
      },
    );
    expect(results).toEqual([
      { kind: "facts", key: "wantsKids", outcome: "written" },
    ]);

    const profile = await w.profile();
    expect(profile?.facts.wantsKids).toMatchObject({
      value: "yes",
      source: "agent",
      model: "test/model",
      sourceQuote: "I definitely want kids.",
    });
    expect((await w.events())[0]).toMatchObject({
      actor: { type: "agent", agent: "candidate_profile", model: "test/model" },
      action: "profile.updated",
    });
  });

  test("a `suggest` field only ever gets a proposal", async () => {
    const w = await world();
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "orientation", value: "straight" }],
      },
    );
    expect(results[0]?.outcome).toBe("suggested");

    const profile = await w.profile();
    // Beside the value, not instead of it: nothing has moved.
    expect(profile?.facts.orientation?.value).toBe("");
    expect(profile?.facts.orientation?.pending?.value).toBe("straight");
    expect((await w.events())[0]?.action).toBe("profile.suggested");
  });

  test("a matchmaker-only field is refused outright", async () => {
    const w = await world();
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [
          { kind: "facts", key: "incomeBand", value: "high" },
          { kind: "notes", key: "matchmakerTake", value: "Lovely." },
        ],
      },
    );
    expect(results.map((r) => r.outcome)).toEqual(["refused", "refused"]);
    expect(await w.profile()).toMatchObject({ facts: {}, notes: {} });
    expect(await w.events()).toHaveLength(0);
  });

  test("it never overwrites what the matchmaker typed — it asks", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "wantsKids",
      value: "no",
    });
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "wantsKids", value: "yes" }],
    });

    const profile = await w.profile();
    expect(profile?.facts.wantsKids?.value).toBe("no");
    expect(profile?.facts.wantsKids?.source).toBe("matchmaker");
    expect(profile?.facts.wantsKids?.pending?.value).toBe("yes");
  });

  test("a bad generation is dropped and the rest of the batch still lands", async () => {
    const w = await world();
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [
          { kind: "facts", key: "heightCm", value: "very tall" },
          { kind: "facts", key: "notAField", value: "x" },
          { kind: "facts", key: "smoking", value: "never" },
        ],
      },
    );
    expect(results.map((r) => r.outcome)).toEqual([
      "refused",
      "refused",
      "written",
    ]);
    expect((await w.profile())?.facts.smoking?.value).toBe("never");
  });

  test("it doesn't nag: the same proposal twice is recorded once", async () => {
    const w = await world();
    const propose = () =>
      w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "religion", value: "Catholic" }],
      });
    await propose();
    const second = await propose();
    expect(second[0]?.outcome).toBe("unchanged");
    expect(await w.events()).toHaveLength(1);
  });
});

describe("resolving a suggestion", () => {
  async function proposed() {
    const w = await world();
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [
        {
          kind: "facts",
          key: "orientation",
          value: "bisexual",
          confidence: 0.6,
        },
      ],
    });
    return w;
  }

  test("accepting moves the value and marks how it got there", async () => {
    const w = await proposed();
    await w.asOwner.mutation(
      api.candidateProfiles.mutations.resolveSuggestion,
      {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "orientation",
        accept: true,
      },
    );

    const entry = (await w.profile())?.facts.orientation;
    expect(entry).toMatchObject({
      value: "bisexual",
      // They agreed with it; they did not write it. A later agent run may
      // revise its own work, but never theirs.
      source: "agent_approved",
      updatedByUserId: w.owner,
    });
    expect(entry?.pending).toBeUndefined();
    expect((await w.events())[1]).toMatchObject({
      action: "profile.suggestion_accepted",
      changes: [{ field: "facts.orientation", after: '"bisexual"' }],
    });
  });

  test("dismissing one on an empty field leaves nothing behind", async () => {
    const w = await proposed();
    await w.asOwner.mutation(
      api.candidateProfiles.mutations.resolveSuggestion,
      {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "orientation",
        accept: false,
      },
    );
    expect((await w.profile())?.facts.orientation).toBeUndefined();
    expect((await w.events())[1]).toMatchObject({
      action: "profile.suggestion_rejected",
      changes: [{ field: "facts.orientation", before: '"bisexual"' }],
    });
  });

  test("clearing a value doesn't answer the question the agent asked", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "wantsKids",
      value: "no",
    });
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "wantsKids", value: "yes" }],
    });
    await w.asOwner.mutation(api.candidateProfiles.mutations.clearEntryValue, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "wantsKids",
    });

    const entry = (await w.profile())?.facts.wantsKids;
    expect(entry?.value).toBe("");
    expect(entry?.pending?.value).toBe("yes");
  });
});

/*
 * ─── A second suggestion on a field that already has one ────────────────────
 *
 * The conversation agent keeps reading; the profile agent keeps hearing about
 * the same field. There is one proposal slot per field, so the newest wins —
 * and the one it replaced has to reach the trail rather than vanishing.
 */
describe("a suggestion on top of a suggestion", () => {
  test("the newer proposal replaces the older, and says what it replaced", async () => {
    const w = await world();
    const propose = (value: string) =>
      w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "religion", value }],
      });
    await propose("Catholic");
    const second = await propose("Lapsed Catholic");
    expect(second[0]?.outcome).toBe("suggested");

    const entry = (await w.profile())?.facts.religion;
    expect(entry?.pending?.value).toBe("Lapsed Catholic");
    expect(entry?.value).toBe("");

    // Two events, and the second one names the proposal it superseded.
    const events = await w.events();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      action: "profile.suggested",
      changes: [
        {
          field: "facts.religion",
          before: '"Catholic"',
          after: '"Lapsed Catholic"',
        },
      ],
    });
    expect(events[1]?.reason).toContain("Replaces an earlier suggestion");
  });

  test("a proposal survives a run that refuses a different field", async () => {
    const w = await world();
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "religion", value: "Catholic" }],
    });
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "incomeBand", value: "high" }],
    });
    expect((await w.profile())?.facts.religion?.pending?.value).toBe(
      "Catholic",
    );
  });
});

/*
 * ─── Removals ───────────────────────────────────────────────────────────────
 *
 * An agent learns that something has stopped being true as often as it learns
 * what is. A removal is its own action, under the same policy as a value.
 */
describe("an agent removing an entry", () => {
  test("on an `agent` field it removes it outright", async () => {
    const w = await world();
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "pets", value: "A cat" }],
    });
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "pets", action: "clear" }],
      },
    );
    expect(results[0]?.outcome).toBe("written");
    expect((await w.profile())?.facts.pets).toBeUndefined();

    const events = await w.events();
    expect(events[1]).toMatchObject({
      action: "profile.updated",
      changes: [{ field: "facts.pets", before: '"A cat"' }],
    });
    expect(events[1]?.changes?.[0]?.after).toBeUndefined();
  });

  test("on a matchmaker's own value it asks instead", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "pets",
      value: "A cat",
    });
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "pets", action: "clear" }],
      },
    );
    expect(results[0]?.outcome).toBe("suggested");

    const entry = (await w.profile())?.facts.pets;
    expect(entry?.value).toBe("A cat");
    expect(entry?.pending).toMatchObject({ action: "clear", value: "" });
  });

  test("a matchmaker-only field refuses a removal too", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "incomeBand",
      value: "high",
    });
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "incomeBand", action: "clear" }],
      },
    );
    expect(results[0]?.outcome).toBe("refused");
    expect((await w.profile())?.facts.incomeBand?.value).toBe("high");
  });

  test("there is nothing to remove on an empty field", async () => {
    const w = await world();
    const results = await w.t.mutation(
      internal.candidateProfiles.mutations.applyAgentEntries,
      {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "pets", action: "clear" }],
      },
    );
    expect(results[0]?.outcome).toBe("unchanged");
    expect(await w.events()).toHaveLength(0);
  });

  test("it doesn't nag: the same removal twice is recorded once", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "pets",
      value: "A cat",
    });
    const propose = () =>
      w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
        candidateId: w.candidateId,
        ...AGENT,
        entries: [{ kind: "facts", key: "pets", action: "clear" as const }],
      });
    await propose();
    expect((await propose())[0]?.outcome).toBe("unchanged");
    expect(await w.events()).toHaveLength(2); // the set, and one proposal
  });
});

describe("a proposed removal, and what answers it", () => {
  async function proposedRemoval() {
    const w = await world();
    await w.asOwner.mutation(api.candidateProfiles.mutations.setEntry, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "pets",
      value: "A cat",
    });
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "pets", action: "clear" }],
    });
    return w;
  }

  test("accepting it removes the entry", async () => {
    const w = await proposedRemoval();
    await w.asOwner.mutation(
      api.candidateProfiles.mutations.resolveSuggestion,
      {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "pets",
        accept: true,
      },
    );
    expect((await w.profile())?.facts.pets).toBeUndefined();
    const events = await w.events();
    expect(events[2]).toMatchObject({
      action: "profile.suggestion_accepted",
      changes: [{ field: "facts.pets", before: '"A cat"' }],
    });
    expect(events[2]?.changes?.[0]?.after).toBeUndefined();
  });

  test("dismissing it keeps the value and drops the question", async () => {
    const w = await proposedRemoval();
    await w.asOwner.mutation(
      api.candidateProfiles.mutations.resolveSuggestion,
      {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        kind: "facts",
        key: "pets",
        accept: false,
      },
    );
    const entry = (await w.profile())?.facts.pets;
    expect(entry?.value).toBe("A cat");
    expect(entry?.pending).toBeUndefined();
  });

  test("clearing it by hand answers the question too", async () => {
    const w = await proposedRemoval();
    await w.asOwner.mutation(api.candidateProfiles.mutations.clearEntryValue, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      kind: "facts",
      key: "pets",
    });
    expect((await w.profile())?.facts.pets).toBeUndefined();
  });

  test("a later value proposal replaces the removal", async () => {
    const w = await proposedRemoval();
    await w.t.mutation(internal.candidateProfiles.mutations.applyAgentEntries, {
      candidateId: w.candidateId,
      ...AGENT,
      entries: [{ kind: "facts", key: "pets", value: "Two cats" }],
    });
    const entry = (await w.profile())?.facts.pets;
    expect(entry?.value).toBe("A cat");
    expect(entry?.pending).toMatchObject({ action: "set", value: "Two cats" });

    // The event says it replaced one, and has no value to name for it.
    const events = await w.events();
    expect(events[2]?.reason).toContain("Replaces an earlier suggestion");
    expect(events[2]?.changes?.[0]?.before).toBeUndefined();
  });
});
