/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ProfileEntry } from "../profiles/helpers";
import schema from "../schema";
import type { ProfileFacts } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

/** The pair from rules.test.ts: they match, and comfortably. */
const SAM: ProfileFacts = {
  age: "34",
  gender: "man",
  locationCity: "Toronto",
  locationCountry: "Canada",
  lookingFor: "marriage",
  wantsKids: "yes",
  smoking: "never",
  drinking: "socially",
  languages: "English",
  religion: "none",
  religionImportance: "low",
  familyImportance: "high",
  exercise: "often",
  diet: "omnivore",
  education: "postgraduate",
  seekingGender: "women",
  partnerAgeRange: "28-38",
};

const JORDAN: ProfileFacts = {
  ...SAM,
  age: "31",
  gender: "woman",
  exercise: "sometimes",
  education: "undergraduate",
  seekingGender: "men",
  partnerAgeRange: "30-42",
};

/** Someone no straight man in the book is looking for: blocked, not low-scored. */
const ALEX: ProfileFacts = {
  ...SAM,
  age: "36",
  gender: "man",
  seekingGender: "men",
};

function entries(facts: ProfileFacts): Record<string, ProfileEntry> {
  const out: Record<string, ProfileEntry> = {};
  for (const [key, value] of Object.entries(facts)) {
    out[key] = { value, source: "matchmaker", updatedAt: 1 };
  }
  return out;
}

async function world(
  book: Record<string, ProfileFacts> = { sam: SAM, jordan: JORDAN },
) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
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
    const candidates: Record<string, Id<"candidates">> = {};
    for (const [name, facts] of Object.entries(book)) {
      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        name,
        email: `${name}@example.test`,
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
      await ctx.db.insert("candidateProfiles", {
        matchmakerId,
        candidateId,
        facts: entries(facts),
        notes: {},
        updatedAt: 1,
      });
      candidates[name] = candidateId;
    }
    return { owner, stranger, matchmakerId, candidates };
  });

  return {
    t,
    ...ids,
    asOwner: t.withIdentity({ subject: `${ids.owner}|s` }),
    asStranger: t.withIdentity({ subject: `${ids.stranger}|s` }),
    run: () =>
      t.mutation(internal.matches.mutations.runForMatchmaker, {
        matchmakerId: ids.matchmakerId,
      }),
    cards: () => t.run((ctx) => ctx.db.query("matches").collect()),
    events: () =>
      t.run((ctx) =>
        ctx.db
          .query("auditEvents")
          .withIndex("by_matchmakerId", (q) =>
            q.eq("matchmakerId", ids.matchmakerId),
          )
          .collect(),
      ),
    setFact: (name: string, key: string, value: string) =>
      t.run(async (ctx) => {
        const profile = await ctx.db
          .query("candidateProfiles")
          .withIndex("by_candidateId", (q) =>
            q.eq("candidateId", ids.candidates[name]),
          )
          .unique();
        if (profile === null) throw new Error("no profile");
        await ctx.db.patch("candidateProfiles", profile._id, {
          facts: {
            ...profile.facts,
            [key]: { value, source: "matchmaker", updatedAt: 2 },
          },
        });
      }),
  };
}

describe("the nightly run", () => {
  test("puts a good pair on the board, scored and explained", async () => {
    const w = await world();
    const report = await w.run();
    expect(report).toMatchObject({ considered: 2, pairs: 1, created: 1 });

    const cards = await w.cards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      matchmakerId: w.matchmakerId,
      origin: "algorithm",
      stage: "suggested",
      algorithmVersion: 1,
    });
    expect(cards[0].score ?? 0).toBeGreaterThan(80);
    expect(cards[0].signals?.length ?? 0).toBeGreaterThan(5);
    // Stored in a fixed order, so the pair can only ever have one card.
    expect(cards[0].candidateAId < cards[0].candidateBId).toBe(true);
    expect(cards[0].pairKey).toBe(
      `${cards[0].candidateAId}:${cards[0].candidateBId}`,
    );
  });

  test("records it on both candidates' trails", async () => {
    const w = await world();
    await w.run();
    const suggested = (await w.events()).filter(
      (event) => event.action === "match.suggested",
    );
    expect(suggested).toHaveLength(2);
    expect(new Set(suggested.map((event) => event.candidateId))).toEqual(
      new Set([w.candidates.sam, w.candidates.jordan]),
    );
    // Each event points at the other person, so a reader can follow the card.
    expect(suggested[0].relatedEntityId).not.toBe(suggested[0].candidateId);
    expect(suggested[0]).toMatchObject({
      entityTable: "matches",
      actor: { type: "system", job: "nightly_match" },
    });
  });

  test("never suggests a pair the hard filters refuse", async () => {
    const w = await world({ sam: SAM, alex: ALEX });
    expect(await w.run()).toMatchObject({ pairs: 1, created: 0 });
    expect(await w.cards()).toHaveLength(0);
  });

  test("leaves someone with no profile out rather than scoring them at nothing", async () => {
    const w = await world({ sam: SAM, jordan: JORDAN });
    await w.t.run(async (ctx) => {
      await ctx.db.insert("candidates", {
        matchmakerId: w.matchmakerId,
        name: "blank",
        email: "blank@example.test",
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
    });
    expect(await w.run()).toMatchObject({ considered: 2, pairs: 1 });
  });

  test("ignores people who haven't joined, and people put aside", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidates.jordan, {
        status: "archived",
      });
    });
    expect(await w.run()).toMatchObject({
      considered: 1,
      pairs: 0,
      created: 0,
    });

    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidates.jordan, {
        status: "active",
        membership: "left",
      });
    });
    expect(await w.run()).toMatchObject({ considered: 1, created: 0 });
  });

  test("is idempotent: a second night adds nothing", async () => {
    const w = await world();
    await w.run();
    const again = await w.run();
    expect(again).toMatchObject({ created: 0, rescored: 0, withdrawn: 0 });
    expect(await w.cards()).toHaveLength(1);
    expect(
      (await w.events()).filter((event) => event.action === "match.suggested"),
    ).toHaveLength(2);
  });

  test("rescores its own untouched suggestion, quietly", async () => {
    const w = await world();
    await w.run();
    const before = (await w.cards())[0];

    await w.setFact("jordan", "smoking", "regularly");
    expect(await w.run()).toMatchObject({ rescored: 1, withdrawn: 0 });

    const after = (await w.cards())[0];
    expect(after.score).toBeLessThan(before.score ?? 0);
    // An arithmetic result recomputed from data whose own change is already in
    // the trail is not a new fact about anybody.
    expect(
      (await w.events()).filter((event) => event.action !== "match.suggested"),
    ).toHaveLength(0);
  });

  test("withdraws a suggestion that has stopped being possible, and says why", async () => {
    const w = await world();
    await w.run();
    await w.setFact("jordan", "gender", "man");
    expect(await w.run()).toMatchObject({ withdrawn: 1 });

    const card = (await w.cards())[0];
    expect(card).toMatchObject({ stage: "rejected", rejectedBy: "system" });
    expect(card.rejectionReason).toContain("looking for");
    const rejected = (await w.events()).filter(
      (event) => event.action === "match.rejected",
    );
    expect(rejected).toHaveLength(2);
    expect(rejected[0].actor).toMatchObject({ type: "system" });
  });

  test("never reopens a card a person has touched", async () => {
    const w = await world();
    await w.run();
    const card = (await w.cards())[0];
    await w.asOwner.mutation(api.matches.mutations.moveStage, {
      matchmakerId: w.matchmakerId,
      matchId: card._id,
      stage: "introduced",
    });
    // Something that would have withdrawn it, had it still been a suggestion.
    await w.setFact("jordan", "gender", "man");
    expect(await w.run()).toMatchObject({
      created: 0,
      withdrawn: 0,
      rescored: 0,
    });
    expect((await w.cards())[0].stage).toBe("introduced");
  });

  test("and never suggests a pair somebody has already turned down", async () => {
    const w = await world();
    await w.run();
    const card = (await w.cards())[0];
    await w.asOwner.mutation(api.matches.mutations.reject, {
      matchmakerId: w.matchmakerId,
      matchId: card._id,
      rejectedBy: "candidateA",
      reason: "Not his type.",
    });
    expect(await w.run()).toMatchObject({ created: 0 });
    expect(await w.cards()).toHaveLength(1);
  });

  test("keeps one tenant's book out of another's", async () => {
    const w = await world();
    const other = await w.t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", {
        email: "rival@example.test",
      });
      const matchmakerId = await ctx.db.insert("matchmakers", {
        ownerUserId: owner,
        username: "rival",
        usernameKey: "rival",
        displayName: "Rival",
      });
      const candidateId = await ctx.db.insert("candidates", {
        matchmakerId,
        email: "theirs@example.test",
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
      await ctx.db.insert("candidateProfiles", {
        matchmakerId,
        candidateId,
        facts: entries(JORDAN),
        notes: {},
        updatedAt: 1,
      });
      return { matchmakerId, candidateId };
    });
    // Maya's run sees two people, not three: facts never cross a tenant.
    expect(await w.run()).toMatchObject({ considered: 2, pairs: 1 });
    expect(
      await w.t.mutation(internal.matches.mutations.runForMatchmaker, {
        matchmakerId: other.matchmakerId,
      }),
    ).toMatchObject({ considered: 1, pairs: 0 });
  });

  test("the fan-out schedules one job per book", async () => {
    const w = await world();
    expect(
      await w.t.mutation(internal.matches.mutations.runNightly, {}),
    ).toEqual({
      books: 1,
    });
    await w.t.finishAllScheduledFunctions(() => {});
    expect(await w.cards()).toHaveLength(1);
  });
});

describe("the matchmaker's own hands", () => {
  test("Find matches runs the same pass, as them", async () => {
    const w = await world();
    const report = await w.asOwner.mutation(api.matches.mutations.refresh, {
      matchmakerId: w.matchmakerId,
    });
    expect(report).toMatchObject({ created: 1 });
    expect((await w.events())[0].actor).toMatchObject({
      type: "user",
      userId: w.owner,
      role: "matchmaker",
    });
  });

  test("a stranger can't read or run anything", async () => {
    const w = await world();
    await expect(
      w.asStranger.query(api.matches.queries.board, {
        matchmakerId: w.matchmakerId,
      }),
    ).rejects.toThrow("not found");
    await expect(
      w.asStranger.mutation(api.matches.mutations.refresh, {
        matchmakerId: w.matchmakerId,
      }),
    ).rejects.toThrow("not found");
  });

  test("a hand-made pair is an identical card, scored the same way", async () => {
    const w = await world();
    await w.asOwner.mutation(api.matches.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateAId: w.candidates.sam,
      candidateBId: w.candidates.jordan,
    });
    const card = (await w.cards())[0];
    expect(card).toMatchObject({ origin: "manual", stage: "suggested" });
    expect(card.score ?? 0).toBeGreaterThan(80);
    expect(
      (await w.events()).filter((event) => event.action === "match.created"),
    ).toHaveLength(2);
  });

  test("a hand-made pair the filters refuse is made, and the trail says so", async () => {
    const w = await world({ sam: SAM, alex: ALEX });
    await w.asOwner.mutation(api.matches.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateAId: w.candidates.sam,
      candidateBId: w.candidates.alex,
    });
    const card = (await w.cards())[0];
    expect(card.score).toBeUndefined();
    const created = (await w.events()).find(
      (event) => event.action === "match.created",
    );
    expect(created?.reason).toContain("against the filters");
  });

  test("the same two people can't be on the board twice", async () => {
    const w = await world();
    await w.run();
    await expect(
      w.asOwner.mutation(api.matches.mutations.create, {
        matchmakerId: w.matchmakerId,
        // The other way round from how the run stored them.
        candidateAId: w.candidates.jordan,
        candidateBId: w.candidates.sam,
      }),
    ).rejects.toThrow("already on the board");
  });

  test("somebody who hasn't joined can't be matched", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidates.jordan, {
        membership: "invited",
      });
    });
    await expect(
      w.asOwner.mutation(api.matches.mutations.create, {
        matchmakerId: w.matchmakerId,
        candidateAId: w.candidates.sam,
        candidateBId: w.candidates.jordan,
      }),
    ).rejects.toThrow("haven't joined");
  });
});

describe("moving a card", () => {
  async function carded() {
    const w = await world();
    await w.run();
    const card = (await w.cards())[0];
    return { w, matchId: card._id };
  }

  test("a stage change is audited on both trails, with the columns named", async () => {
    const { w, matchId } = await carded();
    await w.asOwner.mutation(api.matches.mutations.moveStage, {
      matchmakerId: w.matchmakerId,
      matchId,
      stage: "reviewing",
    });
    const moved = (await w.events()).filter(
      (event) => event.action === "match.stage_changed",
    );
    expect(moved).toHaveLength(2);
    expect(moved[0].changes).toEqual([
      { field: "stage", before: '"suggested"', after: '"reviewing"' },
    ]);
    expect((await w.cards())[0].stage).toBe("reviewing");
  });

  test("the Rejected lane is only reachable through Reject", async () => {
    const { w, matchId } = await carded();
    await expect(
      w.asOwner.mutation(api.matches.mutations.moveStage, {
        matchmakerId: w.matchmakerId,
        matchId,
        stage: "rejected",
      }),
    ).rejects.toThrow("use Reject");
  });

  test("a rejection needs somebody who made it", async () => {
    const { w, matchId } = await carded();
    await expect(
      w.asOwner.mutation(api.matches.mutations.reject, {
        matchmakerId: w.matchmakerId,
        matchId,
        rejectedBy: "system",
        reason: "Pretending to be the cron.",
      }),
    ).rejects.toThrow("who turned it down");
    await expect(
      w.asOwner.mutation(api.matches.mutations.reject, {
        matchmakerId: w.matchmakerId,
        matchId,
        rejectedBy: "matchmaker",
        reason: "  ",
      }),
    ).rejects.toThrow("Say why");
  });

  test("moving a card back onto the board clears the rejection", async () => {
    const { w, matchId } = await carded();
    await w.asOwner.mutation(api.matches.mutations.reject, {
      matchmakerId: w.matchmakerId,
      matchId,
      rejectedBy: "matchmaker",
      reason: "Bad timing.",
    });
    await w.asOwner.mutation(api.matches.mutations.moveStage, {
      matchmakerId: w.matchmakerId,
      matchId,
      stage: "reviewing",
    });
    const card = (await w.cards())[0];
    expect(card.rejectedBy).toBeUndefined();
    expect(card.rejectionReason).toBeUndefined();
  });

  test("arriving at Introduced opens both answers", async () => {
    const { w, matchId } = await carded();
    await w.asOwner.mutation(api.matches.mutations.moveStage, {
      matchmakerId: w.matchmakerId,
      matchId,
      stage: "introduced",
    });
    expect((await w.cards())[0]).toMatchObject({
      candidateAResponse: "pending",
      candidateBResponse: "pending",
    });
  });

  test("two yeses are what mutual interest means", async () => {
    const { w, matchId } = await carded();
    const move = (stage: "introduced") =>
      w.asOwner.mutation(api.matches.mutations.moveStage, {
        matchmakerId: w.matchmakerId,
        matchId,
        stage,
      });
    const answer = (side: "a" | "b", response: "yes" | "no") =>
      w.asOwner.mutation(api.matches.mutations.recordResponse, {
        matchmakerId: w.matchmakerId,
        matchId,
        side,
        response,
      });

    await move("introduced");
    await answer("a", "yes");
    expect((await w.cards())[0].stage).toBe("introduced");
    await answer("b", "yes");
    expect((await w.cards())[0].stage).toBe("mutual_interest");
    expect(
      (await w.events()).filter(
        (event) => event.action === "match.stage_changed",
      ),
    ).toHaveLength(4); // the move in, and the advance out
  });

  test("an outcome is recorded once it's said", async () => {
    const { w, matchId } = await carded();
    await w.asOwner.mutation(api.matches.mutations.recordOutcome, {
      matchmakerId: w.matchmakerId,
      matchId,
      outcome: "Engaged, eighteen months later.",
    });
    expect((await w.cards())[0].outcome).toBe(
      "Engaged, eighteen months later.",
    );
    await expect(
      w.asOwner.mutation(api.matches.mutations.recordOutcome, {
        matchmakerId: w.matchmakerId,
        matchId,
        outcome: " ",
      }),
    ).rejects.toThrow("what came of it");
  });

  test("another tenant's card is not found, not forbidden", async () => {
    const { w, matchId } = await carded();
    await expect(
      w.asStranger.mutation(api.matches.mutations.moveStage, {
        matchmakerId: w.matchmakerId,
        matchId,
        stage: "reviewing",
      }),
    ).rejects.toThrow("not found");
  });
});

describe("the board", () => {
  test("comes back with both people named and the reasons attached", async () => {
    const w = await world();
    await w.run();
    const cards = await w.asOwner.query(api.matches.queries.board, {
      matchmakerId: w.matchmakerId,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].a.name).toBeDefined();
    expect(cards[0].b.name).toBeDefined();
    expect(cards[0].signals?.length ?? 0).toBeGreaterThan(5);
  });

  test("hides a rejection once it has aged out", async () => {
    const w = await world();
    await w.run();
    const card = (await w.cards())[0];
    await w.asOwner.mutation(api.matches.mutations.reject, {
      matchmakerId: w.matchmakerId,
      matchId: card._id,
      rejectedBy: "matchmaker",
      reason: "Bad timing.",
    });
    expect(
      await w.asOwner.query(api.matches.queries.board, {
        matchmakerId: w.matchmakerId,
      }),
    ).toHaveLength(1);

    await w.t.run(async (ctx) => {
      await ctx.db.patch("matches", card._id, {
        stageChangedAt: Date.now() - 60 * 86_400_000,
      });
    });
    expect(
      await w.asOwner.query(api.matches.queries.board, {
        matchmakerId: w.matchmakerId,
      }),
    ).toHaveLength(0);
    // Out of the view, not out of the table: the reason is the taste signal.
    expect(await w.cards()).toHaveLength(1);
  });

  test("offers only people a match can actually be made with", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidates.jordan, {
        status: "archived",
      });
    });
    const people = await w.asOwner.query(api.matches.queries.matchable, {
      matchmakerId: w.matchmakerId,
    });
    expect(people.map((person) => person.name)).toEqual(["sam"]);
  });
});
