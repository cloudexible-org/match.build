/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { DEV_MATCHMAKER, DEV_MEMBERS, DEV_USERS } from "./fixture";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://matchbuild.localhost/app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seed.dev.mutations.apply", () => {
  test("creates every account, the profile, the book and the invite", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.seed.dev.mutations.apply, {});

    expect(result.accounts.map((a) => a.email)).toEqual(
      DEV_USERS.map((u) => u.email),
    );

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      matchmakers: await ctx.db.query("matchmakers").collect(),
      candidates: await ctx.db.query("candidates").collect(),
      conversations: await ctx.db.query("conversations").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));

    expect(state.users).toHaveLength(DEV_USERS.length);
    expect(
      state.users.every((u) => u.emailVerificationTime !== undefined),
    ).toBe(true);
    expect(state.matchmakers).toHaveLength(1);
    expect(state.matchmakers[0].username).toBe(DEV_MATCHMAKER.username);

    const joined = state.candidates.filter((c) => c.membership === "joined");
    const invited = state.candidates.filter((c) => c.membership === "invited");
    const left = state.candidates.filter((c) => c.membership === "left");
    const departed = DEV_MEMBERS.filter((m) => m.left !== undefined);
    expect(joined).toHaveLength(DEV_MEMBERS.length - departed.length);
    expect(invited).toHaveLength(1);
    expect(invited[0].invite).toBeDefined();
    expect(state.conversations).toHaveLength(DEV_MEMBERS.length);

    // Whoever left kept their thread, and their reason is on the record.
    expect(left).toHaveLength(departed.length);
    expect(left[0].leaveReason).toBe(departed[0].left?.reason);
    expect(left[0].membershipChangedAt).toBeLessThan(Date.now());

    const seeded = DEV_MEMBERS.flatMap((m) => m.messages);
    expect(state.messages).toHaveLength(seeded.length);
    // The seeded conversation with a private message in it.
    const thread = state.conversations.find((c) => c.lastSeq === 3);
    expect(thread).toBeDefined();
    // The last message is matchmaker-only, so the candidate's view ends earlier.
    expect(thread?.lastPublicSeq).toBe(2);
  });

  test("seeds the profiles and the proposals waiting on them", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});

    const state = await t.run(async (ctx) => ({
      profiles: await ctx.db.query("candidateProfiles").collect(),
      mine: await ctx.db.query("matchmakerProfiles").collect(),
    }));

    const withProfile = DEV_MEMBERS.filter((m) => m.profile !== undefined);
    expect(state.profiles).toHaveLength(withProfile.length);

    // Every seeded suggestion is an open `pending` on its entry — the state an
    // agent produces, and the reason the cards above the composer have
    // anything to show in dev.
    const open = state.profiles.flatMap((profile) =>
      [...Object.values(profile.facts), ...Object.values(profile.notes)].filter(
        (entry) => entry.pending !== undefined,
      ),
    );
    expect(open).toHaveLength(
      withProfile.flatMap((m) => m.profile?.suggestions ?? []).length,
    );

    // A proposal sits beside the value, never instead of it.
    const replacing = state.profiles
      .flatMap((p) => Object.entries(p.facts))
      .find(([key]) => key === "lookingFor");
    expect(replacing?.[1].value).toBe("unsure");
    expect(replacing?.[1].pending?.value).toBe("long-term");
    // And it carries the candidate's own words, so a card can quote them.
    expect(replacing?.[1].pending?.sourceQuote).toBeDefined();

    // A proposal can be that the entry go, and "" could not have said so.
    const removal = state.profiles
      .flatMap((p) => Object.entries(p.facts))
      .find(([key]) => key === "pets");
    expect(removal?.[1].pending?.action).toBe("clear");
    expect(removal?.[1].value).toBe("A cat, Miso");

    // The matchmaker's own voice, with the agent's draft waiting on it.
    expect(state.mine).toHaveLength(1);
    expect(state.mine[0].voice?.value).toBe(DEV_MATCHMAKER.voice);
    expect(state.mine[0].voice?.pending?.value).toBe(
      DEV_MATCHMAKER.voiceSuggestion,
    );
  });

  test("gives a profile to a candidate seeded before profiles existed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});

    // The state a dev database seeded by the older version of this file is in:
    // the people and their threads, and no profiles at all.
    await t.run(async (ctx) => {
      for (const profile of await ctx.db.query("candidateProfiles").collect()) {
        await ctx.db.delete("candidateProfiles", profile._id);
      }
      for (const mine of await ctx.db.query("matchmakerProfiles").collect()) {
        await ctx.db.delete("matchmakerProfiles", mine._id);
      }
    });

    const again = await t.mutation(internal.seed.dev.mutations.apply, {});
    // Only the profiles come back — nobody is seeded twice.
    expect(again.created.every((line) => !line.startsWith("member "))).toBe(
      true,
    );

    const after = await t.run(async (ctx) => ({
      profiles: (await ctx.db.query("candidateProfiles").collect()).length,
      mine: (await ctx.db.query("matchmakerProfiles").collect()).length,
      candidates: (await ctx.db.query("candidates").collect()).length,
    }));
    expect(after.profiles).toBe(
      DEV_MEMBERS.filter((m) => m.profile !== undefined).length,
    );
    expect(after.mine).toBe(1);
    expect(after.candidates).toBe(DEV_MEMBERS.length + 1);
  });

  test("adds proposals to a profile someone has already filled in", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});

    // The state a dev database is actually in by the time a new proposal is
    // added to the fixture: these people were seeded long ago and have since
    // been clicked on, so they have a profile — with values of their own, and
    // nothing pending.
    const sam = DEV_MEMBERS.find((m) => m.userSlug === "candidate");
    await t.run(async (ctx) => {
      for (const profile of await ctx.db.query("candidateProfiles").collect()) {
        await ctx.db.patch("candidateProfiles", profile._id, {
          facts: {
            // Typed by hand, and nothing the fixture mentions.
            pronouns: { value: "he/him", source: "matchmaker", updatedAt: 1 },
            // The same key the fixture proposes against, with their value.
            lookingFor: {
              value: "companionship",
              source: "matchmaker",
              updatedAt: 1,
            },
          },
          notes: {},
        });
      }
      for (const mine of await ctx.db.query("matchmakerProfiles").collect()) {
        await ctx.db.patch("matchmakerProfiles", mine._id, {
          voice: { value: "Mine.", source: "matchmaker", updatedAt: 1 },
        });
      }
    });

    const again = await t.mutation(internal.seed.dev.mutations.apply, {});
    expect(again.created.some((line) => line.includes("entries on the"))).toBe(
      true,
    );

    const state = await t.run(async (ctx) => {
      const profiles = await ctx.db.query("candidateProfiles").collect();
      const withEmails = [];
      for (const profile of profiles) {
        const candidate = await ctx.db.get("candidates", profile.candidateId);
        withEmails.push({ email: candidate?.email ?? "", profile });
      }
      return {
        profiles: withEmails,
        mine: (await ctx.db.query("matchmakerProfiles").collect())[0],
      };
    });

    const samProfile = state.profiles.find((p) =>
      p.email.startsWith("sam."),
    )?.profile;
    expect(samProfile).toBeDefined();
    if (samProfile === undefined) return;

    // Every proposal the fixture asks for is now open.
    const pending = [
      ...Object.values(samProfile.facts),
      ...Object.values(samProfile.notes),
    ].filter((entry) => entry.pending !== undefined);
    expect(pending).toHaveLength(sam?.profile?.suggestions?.length ?? 0);

    // What they typed is untouched — the value, and the fact they wrote it.
    expect(samProfile.facts.pronouns?.value).toBe("he/him");
    expect(samProfile.facts.pronouns?.pending).toBeUndefined();
    expect(samProfile.facts.lookingFor?.value).toBe("companionship");
    expect(samProfile.facts.lookingFor?.source).toBe("matchmaker");
    // The proposal sits beside it, against what is really there rather than
    // against the value the fixture imagined.
    expect(samProfile.facts.lookingFor?.pending?.value).toBe("long-term");

    // Same rule for their voice: theirs stays, the draft is added.
    expect(state.mine?.voice?.value).toBe("Mine.");
    expect(state.mine?.voice?.pending?.value).toBe(
      DEV_MATCHMAKER.voiceSuggestion,
    );
  });

  test("leaves a proposal that is already open alone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});

    // `?? 0`: an array with an `undefined` in it is not a Convex value.
    const stamps = async () =>
      await t.run(async (ctx) =>
        (await ctx.db.query("candidateProfiles").collect()).flatMap((p) =>
          Object.values(p.facts).map((e) => e.pending?.suggestedAt ?? 0),
        ),
      );

    const before = await stamps();
    const again = await t.mutation(internal.seed.dev.mutations.apply, {});
    const after = await stamps();

    expect(again.created).toEqual([]);
    expect(after).toEqual(before);
  });

  test("is a no-op the second time", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.dev.mutations.apply, {});
    const again = await t.mutation(internal.seed.dev.mutations.apply, {});

    expect(again.created).toEqual([]);
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      candidates: (await ctx.db.query("candidates").collect()).length,
    }));
    expect(counts).toEqual({
      users: DEV_USERS.length,
      candidates: DEV_MEMBERS.length + 1,
    });
  });

  test("refuses to run where SITE_URL is not on .localhost", async () => {
    vi.stubEnv("SITE_URL", "https://www.match.build/app");
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seed.dev.mutations.apply, {}),
    ).rejects.toThrow(/not a dev deployment/);
  });

  test("refuses to run where RESEND_API_KEY is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seed.dev.mutations.apply, {}),
    ).rejects.toThrow(/not a dev deployment/);
  });
});
