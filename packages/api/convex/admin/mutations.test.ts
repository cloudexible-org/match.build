/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { AI_AGENT_SEED } from "../seed/ai/fixture";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert("users", {
      email: "admin@example.test",
      emailVerificationTime: 1,
    }),
    member: await ctx.db.insert("users", {
      email: "member@example.test",
      name: "Member",
      emailVerificationTime: 1,
    }),
    unverified: await ctx.db.insert("users", {
      email: "pending@example.test",
    }),
    deleted: await ctx.db.insert("users", {
      email: "gone@example.test",
      emailVerificationTime: 1,
      deletedAt: 2,
    }),
  }));
  return {
    t,
    ids,
    asAdmin: t.withIdentity({ subject: `${ids.admin}|s` }),
    asMember: t.withIdentity({ subject: `${ids.member}|s` }),
  };
}

describe("admin.issueSignInCodeFor", () => {
  test("stores a hashed code for the account, as Convex Auth would, and audits it", async () => {
    const { t, ids, asAdmin } = await world();
    const issued = await asAdmin.mutation(
      api.admin.mutations.issueSignInCodeFor,
      { userId: ids.member },
    );
    expect(issued.email).toBe("member@example.test");
    expect(issued.code).toMatch(/^\d{6}$/);

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q
            .eq("provider", "email-code")
            .eq("providerAccountId", "member@example.test"),
        )
        .unique();
      expect(account?.userId).toBe(ids.member);
      if (account === null) return;

      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      expect(codes).toHaveLength(1);
      expect(codes[0]).toMatchObject({
        provider: "email-code",
        code: await sha256Hex(issued.code),
        expirationTime: issued.expiresAt,
        emailVerified: "member@example.test",
      });

      const events = await ctx.db.query("auditEvents").collect();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: "account.sign_in_code_issued",
        actor: { type: "user", userId: ids.admin, role: "platform_admin" },
        entityTable: "users",
        entityId: ids.member,
      });
      expect(events[0].matchmakerId).toBeUndefined();
    });
  });

  test("replaces an earlier code and reuses the existing auth account", async () => {
    const { t, ids, asAdmin } = await world();
    const issue = () =>
      asAdmin.mutation(api.admin.mutations.issueSignInCodeFor, {
        userId: ids.member,
      });
    await issue();
    const second = await issue();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("authAccounts").collect()).toHaveLength(1);
      const codes = await ctx.db.query("authVerificationCodes").collect();
      expect(codes.map((code) => code.code)).toEqual([
        await sha256Hex(second.code),
      ]);
    });
  });

  test("refuses anyone who isn't a platform admin", async () => {
    const { t, ids, asMember } = await world();
    await expect(
      asMember.mutation(api.admin.mutations.issueSignInCodeFor, {
        userId: ids.member,
      }),
    ).rejects.toThrow("isn't a platform admin");
    await expect(
      t.mutation(api.admin.mutations.issueSignInCodeFor, {
        userId: ids.member,
      }),
    ).rejects.toThrow("sign in");
  });

  test("an unconfigured deployment has no admins", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    const { ids, asAdmin } = await world();
    await expect(
      asAdmin.mutation(api.admin.mutations.issueSignInCodeFor, {
        userId: ids.member,
      }),
    ).rejects.toThrow("isn't a platform admin");
  });

  test("refuses unverified and deleted accounts, and writes nothing", async () => {
    const { t, ids, asAdmin } = await world();
    for (const userId of [ids.unverified, ids.deleted]) {
      await expect(
        asAdmin.mutation(api.admin.mutations.issueSignInCodeFor, { userId }),
      ).rejects.toThrow("can't sign in");
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query("authVerificationCodes").collect()).toEqual([]);
      expect(await ctx.db.query("auditEvents").collect()).toEqual([]);
    });
  });

  test("refuses when the address signs in to a different user", async () => {
    const { t, ids, asAdmin } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: ids.admin,
        provider: "email-code",
        providerAccountId: "member@example.test",
      });
    });
    await expect(
      asAdmin.mutation(api.admin.mutations.issueSignInCodeFor, {
        userId: ids.member,
      }),
    ).rejects.toThrow("different account");
  });
});

describe("admin.eraseAccount", () => {
  /**
   * A person with two matchmakers, each holding a full record of them: a
   * thread, a private note, and a trail with their name, address and handles
   * in it. Erasure has to reach every copy of *them* without touching any of
   * the record.
   */
  async function person() {
    const base = await world();
    const jane = await base.t.run((ctx) =>
      ctx.db.insert("users", {
        email: "jane@example.test",
        name: "Jane Doe",
        emailVerificationTime: 1,
      }),
    );
    const books = [];
    for (const label of ["alpha", "bravo"]) {
      const ids = await base.t.run(async (ctx) => {
        const ownerUserId = await ctx.db.insert("users", {
          email: `${label}@example.test`,
          name: `${label} owner`,
          emailVerificationTime: 1,
        });
        const matchmakerId = await ctx.db.insert("matchmakers", {
          ownerUserId,
          username: `${label}.matches`,
          usernameKey: `${label}matches`,
          displayName: `${label} Book`,
        });
        const candidateId = await ctx.db.insert("candidates", {
          matchmakerId,
          userId: jane,
          name: "Jane Doe",
          email: "jane@example.test",
          socialHandles: [{ platform: "instagram", handle: "jane.doe" }],
          membership: "left",
          membershipChangedAt: 3,
          leaveReason: "Met someone through a friend called Sam.",
          status: "active",
        });
        const conversationId = await ctx.db.insert("conversations", {
          matchmakerId,
          candidateId,
          lastSeq: 1,
          lastPublicSeq: 1,
          lastMessageAt: 1,
          matchmakerLastReadSeq: 1,
          candidateLastReadSeq: 1,
        });
        await ctx.db.insert("messages", {
          matchmakerId,
          conversationId,
          seq: 1,
          author: "candidate",
          authorUserId: jane,
          visibility: "everyone",
          source: "typed",
          body: "Looking for someone kind.",
          sentAt: 1,
        });
        // Their profile: the personal facts an erasure has to reach, the
        // workflow ones it must leave, and a note in the matchmaker's own
        // words, which it never touches (prd/phase-2.md §3).
        await ctx.db.insert("candidateProfiles", {
          matchmakerId,
          candidateId,
          facts: {
            dateOfBirth: {
              value: "1990-04-02",
              source: "matchmaker",
              updatedAt: 1,
            },
            locationCity: {
              value: "Lisbon",
              source: "matchmaker",
              updatedAt: 1,
            },
            wantsKids: { value: "yes", source: "matchmaker", updatedAt: 1 },
          },
          notes: {
            matchmakerTake: {
              value: "Great first call.",
              source: "matchmaker",
              updatedAt: 1,
            },
          },
          updatedAt: 1,
        });
        // The trail as the product would have written it: her details, her
        // reason for leaving, and a status change that is the matchmaker's
        // own workflow rather than anything about her.
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: { type: "user", userId: ownerUserId, role: "matchmaker" },
          action: "candidate.details_changed",
          entityTable: "candidates",
          entityId: candidateId,
          changes: [
            {
              field: "email",
              before: '"jane@gmial.test"',
              after: '"jane@example.test"',
            },
            { field: "name", after: '"Jane Doe"' },
          ],
        });
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: { type: "user", userId: ownerUserId, role: "matchmaker" },
          action: "candidate.status_changed",
          entityTable: "candidates",
          entityId: candidateId,
          changes: [{ field: "status", before: '"active"', after: '"paused"' }],
        });
        await ctx.db.insert("auditEvents", {
          matchmakerId,
          candidateId,
          actor: { type: "user", userId: jane, role: "candidate" },
          action: "membership.left",
          entityTable: "candidates",
          entityId: candidateId,
          changes: [
            { field: "membership", before: '"joined"', after: '"left"' },
          ],
          reason: "Met someone through a friend called Sam.",
        });
        return { matchmakerId, candidateId, conversationId, ownerUserId };
      });
      books.push(ids);
    }
    // Things that are copies of her and nobody's record: an unsent email and
    // a marketing sign-up.
    await base.t.run(async (ctx) => {
      await ctx.db.insert("emailOutbox", {
        to: "jane@example.test",
        kind: "sign_in_code",
        subject: "123456 is your sign-in code",
        text: "123456",
      });
      await ctx.db.insert("waitlist", {
        email: "jane@example.test",
        name: "Jane Doe",
        instagram: "jane.doe",
        source: "landing",
      });
    });
    return { ...base, jane, books };
  }

  const erase = (w: Awaited<ReturnType<typeof person>>) =>
    w.asAdmin.mutation(api.admin.mutations.eraseAccount, {
      userId: w.jane,
      confirmEmail: "jane@example.test",
    });

  test("leaves no way to tell who the person was", async () => {
    const w = await person();
    const result = await erase(w);
    expect(result.candidates).toBe(2);
    expect(result.auditEventsRedacted).toBe(4); // two details + two left

    const state = await w.t.run(async (ctx) => ({
      user: await ctx.db.get("users", w.jane),
      candidates: await ctx.db.query("candidates").collect(),
      events: await ctx.db.query("auditEvents").collect(),
      outbox: await ctx.db.query("emailOutbox").collect(),
      waitlist: await ctx.db.query("waitlist").collect(),
    }));

    // Nothing anywhere still says "Jane", her address, or her handle.
    const everything = JSON.stringify(state);
    for (const trace of [
      "Jane Doe",
      "jane@example.test",
      "jane.doe",
      "jane@gmial.test",
    ]) {
      expect(everything).not.toContain(trace);
    }
    // Including the free text she wrote about herself when she left.
    expect(everything).not.toContain("friend called Sam");

    expect(state.user?.name).toBe("Erased account");
    expect(state.user?.email).toMatch(/^erased-[0-9a-f]{12}@erased\.invalid$/);
    expect(state.user?.deletedAt).toBeDefined();
    for (const candidate of state.candidates) {
      expect(candidate.name).toBe("Erased candidate");
      expect(candidate.socialHandles).toEqual([]);
      expect(candidate.leaveReason).toBeUndefined();
    }
    // Two erased candidates must not collide on the one-per-email rule.
    expect(new Set(state.candidates.map((row) => row.email)).size).toBe(2);
    expect(state.outbox).toHaveLength(0);
    expect(state.waitlist).toHaveLength(0);
  });

  test("leaves every matchmaker's record of the relationship intact", async () => {
    const w = await person();
    await erase(w);

    for (const book of w.books) {
      const asOwner = w.t.withIdentity({ subject: `${book.ownerUserId}|s` });
      // The thread, including what she wrote.
      const thread = await asOwner.query(api.messages.queries.thread, {
        matchmakerId: book.matchmakerId,
        candidateId: book.candidateId,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(thread.page.map((message) => message.body)).toEqual([
        "Looking for someone kind.",
      ]);
      // Their profile: who she was is gone, what they were working with
      // stays, and their own words are untouched.
      const profile = await asOwner.query(api.candidateProfiles.queries.get, {
        matchmakerId: book.matchmakerId,
        candidateId: book.candidateId,
      });
      expect(profile.facts.dateOfBirth?.value).toBe("[erased]");
      expect(profile.facts.locationCity?.value).toBe("[erased]");
      expect(profile.facts.wantsKids?.value).toBe("yes");
      expect(profile.notes.matchmakerTake?.value).toBe("Great first call.");

      // And the history: every event still there, still readable, with the
      // workflow values intact and only the personal ones gone.
      const history = await asOwner.query(api.audit.queries.candidateHistory, {
        matchmakerId: book.matchmakerId,
        candidateId: book.candidateId,
        filter: "all",
        paginationOpts: { numItems: 20, cursor: null },
      });
      const actions = history.page.map((event) => event.action);
      expect(actions).toContain("candidate.details_changed");
      expect(actions).toContain("membership.left");
      expect(actions).toContain("candidate.anonymised");

      const status = history.page.find(
        (event) => event.action === "candidate.status_changed",
      );
      expect(status?.changes).toEqual([
        { field: "status", before: '"active"', after: '"paused"' },
      ]);
      const details = history.page.find(
        (event) => event.action === "candidate.details_changed",
      );
      expect(details?.changes).toEqual([
        { field: "email", before: '"[erased]"', after: '"[erased]"' },
        // An absent `before` stays absent: it said nothing to begin with.
        { field: "name", after: '"[erased]"' },
      ]);
    }
  });

  test("is refused without the account's own address typed back", async () => {
    const w = await person();
    await expect(
      w.asAdmin.mutation(api.admin.mutations.eraseAccount, {
        userId: w.jane,
        confirmEmail: "jane@example.tes",
      }),
    ).rejects.toThrow("Type the account's email address exactly");
    const user = await w.t.run((ctx) => ctx.db.get("users", w.jane));
    expect(user?.name).toBe("Jane Doe");
  });

  test("is refused to anyone who isn't a platform admin, and for a matchmaker", async () => {
    const w = await person();
    await expect(
      w.asMember.mutation(api.admin.mutations.eraseAccount, {
        userId: w.jane,
        confirmEmail: "jane@example.test",
      }),
    ).rejects.toThrow("This account isn't a platform admin.");

    await expect(
      w.asAdmin.mutation(api.admin.mutations.eraseAccount, {
        userId: w.books[0].ownerUserId,
        confirmEmail: "alpha@example.test",
      }),
    ).rejects.toThrow("owns a matchmaker profile");
  });

  test("says so rather than erasing an already-erased account twice", async () => {
    const w = await person();
    await erase(w);
    const erased = await w.t.run((ctx) => ctx.db.get("users", w.jane));
    await expect(
      w.asAdmin.mutation(api.admin.mutations.eraseAccount, {
        userId: w.jane,
        confirmEmail: erased?.email ?? "",
      }),
    ).rejects.toThrow("already been erased");
  });

  test("records who did it, at account level and in each matchmaker's trail", async () => {
    const w = await person();
    await erase(w);
    const events = await w.t.run((ctx) =>
      ctx.db.query("auditEvents").collect(),
    );
    const erasure = events.filter((event) => event.action === "account.erased");
    expect(erasure).toHaveLength(1);
    expect(erasure[0].matchmakerId).toBeUndefined();
    expect(erasure[0].actor).toEqual({
      type: "user",
      userId: w.ids.admin,
      role: "platform_admin",
    });
    // One per matchmaker, each only in their own trail.
    const anonymised = events.filter(
      (event) => event.action === "candidate.anonymised",
    );
    expect(anonymised).toHaveLength(2);
    expect(new Set(anonymised.map((event) => event.matchmakerId)).size).toBe(2);
  });
});

describe("admin AI agent settings", () => {
  test("an agent nobody has set up is off, empty, and says it was never set up", async () => {
    const { asAdmin } = await world();
    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});

    expect(agents.map((a) => a.agent)).toEqual([
      "conversation",
      "candidate_profile",
      "voice_profile",
    ]);
    for (const agent of agents) {
      // No defaults anywhere: nothing is substituted for a row that isn't there.
      expect(agent.exists).toBe(false);
      expect(agent.enabled).toBe(false);
      expect(agent.model).toBe("");
      expect(agent.systemPrompt).toBe("");
      expect(agent.offReason).toBe("unconfigured");
      expect(agent.updatedAt).toBeUndefined();
    }
  });

  test("the seed creates every agent, and running it again changes nothing", async () => {
    const { t, asAdmin } = await world();
    const first = await t.mutation(internal.seed.ai.mutations.apply, {});
    expect(first.created).toHaveLength(3);
    expect(first.kept).toHaveLength(0);

    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    for (const agent of agents) {
      // Asserted against the fixture rather than a hard-coded model, so
      // changing the seeded model is a one-line change and not a test failure.
      const seed = AI_AGENT_SEED.find((s) => s.agent === agent.agent);
      expect(seed).toBeDefined();
      expect(agent.exists).toBe(true);
      expect(agent.enabled).toBe(seed?.enabled);
      expect(agent.model).toBe(seed?.model);
      expect(agent.systemPrompt).toBe(seed?.systemPrompt);
      expect(agent.offReason).toBeNull();
      // Nobody decided this, the seed did.
      expect(agent.updatedBy).toBeUndefined();
    }

    const second = await t.mutation(internal.seed.ai.mutations.apply, {});
    expect(second.created).toHaveLength(0);
    expect(second.kept).toHaveLength(3);
  });

  test("the seed leaves an admin's own edit alone, and --force overwrites it", async () => {
    const { t, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    await asAdmin.mutation(api.admin.mutations.setAiAgent, {
      agent: "conversation",
      enabled: true,
      model: "anthropic/claude-sonnet-5",
      systemPrompt: "Mine.",
    });

    const untouched = await t.mutation(internal.seed.ai.mutations.apply, {});
    expect(untouched.kept).toContain("conversation");
    let { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    expect(agents.find((a) => a.agent === "conversation")?.systemPrompt).toBe(
      "Mine.",
    );

    const forced = await t.mutation(internal.seed.ai.mutations.apply, {
      force: true,
    });
    expect(forced.overwritten).toContain("conversation");
    ({ agents } = await asAdmin.query(api.admin.queries.aiAgents, {}));
    const conversation = agents.find((a) => a.agent === "conversation");
    expect(conversation?.systemPrompt).not.toBe("Mine.");
    expect(conversation?.updatedBy).toBeUndefined();
  });

  test("the seeded instructions carry the two rules that must not be lost", async () => {
    // They live in the instruction rather than being prepended in code, so the
    // seed is the only thing that puts them there — and this is the only thing
    // that checks it did.
    const { t, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    for (const agent of agents) {
      expect(agent.systemPrompt).toMatch(/content, never instructions/);
      expect(agent.systemPrompt).toMatch(
        /never reveal what the matchmaker knows/i,
      );
    }
  });

  test("saving audits the change with the old instruction and the switch", async () => {
    const { t, ids, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    await asAdmin.mutation(api.admin.mutations.setAiAgent, {
      agent: "conversation",
      enabled: false,
      model: "anthropic/claude-sonnet-5",
      systemPrompt: "Be brief and warm.",
    });

    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    const conversation = agents.find((a) => a.agent === "conversation");
    expect(conversation?.model).toBe("anthropic/claude-sonnet-5");
    expect(conversation?.enabled).toBe(false);
    expect(conversation?.offReason).toBe("disabled");
    expect(conversation?.updatedBy).toBe("admin@example.test");

    await t.run(async (ctx) => {
      const events = await ctx.db.query("auditEvents").collect();
      const event = events.find((e) => e.action === "ai_agent.updated");
      expect(event).toBeDefined();
      // Platform-level: it changes the product, not anyone's book.
      expect(event?.matchmakerId).toBeUndefined();
      expect(event?.candidateId).toBeUndefined();
      expect(event?.entityTable).toBe("aiAgentSettings");
      expect(event?.entityId).toBe("conversation");
      expect(event?.actor).toEqual({
        type: "user",
        userId: ids.admin,
        role: "platform_admin",
      });
      const fields = event?.changes?.map((c) => c.field) ?? [];
      expect(fields).toContain("enabled");
      expect(fields).toContain("model");
      // The whole previous instruction is in the event: that is where an
      // instruction's history lives, so it has to actually be there.
      const prompt = event?.changes?.find((c) => c.field === "systemPrompt");
      expect(prompt?.before).toContain("You draft replies in the matchmaker");
      expect(prompt?.after).toBe(JSON.stringify("Be brief and warm."));
    });
  });

  test("clearing the model turns the agent off, and says which way", async () => {
    const { t, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    await asAdmin.mutation(api.admin.mutations.setAiAgent, {
      agent: "voice_profile",
      enabled: true,
      model: "",
      systemPrompt: "Still here.",
    });

    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    const voice = agents.find((a) => a.agent === "voice_profile");
    expect(voice?.enabled).toBe(true);
    expect(voice?.model).toBe("");
    expect(voice?.offReason).toBe("no_model");
  });

  test("clearing the instruction turns it off too", async () => {
    const { t, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    await asAdmin.mutation(api.admin.mutations.setAiAgent, {
      agent: "voice_profile",
      enabled: true,
      model: "anthropic/claude-haiku-4-5",
      systemPrompt: "",
    });
    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    expect(agents.find((a) => a.agent === "voice_profile")?.offReason).toBe(
      "no_instruction",
    );
  });

  test("a save that changes nothing records nothing", async () => {
    const { t, asAdmin } = await world();
    await t.mutation(internal.seed.ai.mutations.apply, {});
    const { agents } = await asAdmin.query(api.admin.queries.aiAgents, {});
    const conversation = agents.find((a) => a.agent === "conversation");
    if (conversation === undefined) throw new Error("no conversation agent");

    await asAdmin.mutation(api.admin.mutations.setAiAgent, {
      agent: "conversation",
      enabled: conversation.enabled,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
    });

    await t.run(async (ctx) => {
      const events = await ctx.db.query("auditEvents").collect();
      expect(
        events.filter((e) => e.action === "ai_agent.updated"),
      ).toHaveLength(0);
    });
  });

  test("refuses a model the gateway couldn't accept, and changes nothing", async () => {
    const { t, asAdmin } = await world();
    await expect(
      asAdmin.mutation(api.admin.mutations.setAiAgent, {
        agent: "conversation",
        enabled: true,
        model: "claude-opus-5",
        systemPrompt: "Be brief.",
      }),
    ).rejects.toThrow(/provider, a slash/);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("aiAgentSettings").collect()).toHaveLength(0);
    });
  });

  test("a matchmaker who isn't a platform admin can neither read nor write it", async () => {
    const { asMember } = await world();
    await expect(
      asMember.query(api.admin.queries.aiAgents, {}),
    ).rejects.toThrow(/platform admin/);
    await expect(
      asMember.mutation(api.admin.mutations.setAiAgent, {
        agent: "conversation",
        enabled: true,
        model: "anthropic/claude-opus-5",
        systemPrompt: "Mine now.",
      }),
    ).rejects.toThrow(/platform admin/);
  });
});
