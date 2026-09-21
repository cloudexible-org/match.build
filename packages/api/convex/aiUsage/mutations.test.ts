/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { dayKey } from "./rules";

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

const MODEL = "openai/gpt-5.6-luna";

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      email: "admin@example.test",
      emailVerificationTime: 1,
    });
    const owner = await ctx.db.insert("users", {
      email: "maya@example.test",
      emailVerificationTime: 1,
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
    const conversationId = await ctx.db.insert("conversations", {
      matchmakerId,
      candidateId,
      lastSeq: 0,
      lastPublicSeq: 0,
      lastMessageAt: 1,
      matchmakerLastReadSeq: 0,
      candidateLastReadSeq: 0,
    });
    return { admin, matchmakerId, candidateId, conversationId };
  });
  return { t, ids };
}

/** One generation, as an action would record it. */
async function record(
  t: Awaited<ReturnType<typeof world>>["t"],
  args: Partial<{
    agent: "conversation" | "candidate_profile" | "voice_profile";
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    conversationId: Id<"conversations">;
    matchmakerId: Id<"matchmakers">;
  }> = {},
) {
  await t.mutation(internal.aiUsage.mutations.record, {
    agent: args.agent ?? "conversation",
    model: args.model ?? MODEL,
    inputTokens: args.inputTokens ?? 1_000,
    outputTokens: args.outputTokens ?? 500,
    cachedInputTokens: args.cachedInputTokens,
    conversationId: args.conversationId,
    matchmakerId: args.matchmakerId,
  });
}

async function rows(t: Awaited<ReturnType<typeof world>>["t"]) {
  return await t.run(
    async (ctx) => await ctx.db.query("aiGenerations").collect(),
  );
}

describe("recording a generation", () => {
  test("stores the tokens, today's UTC day, and no cost when unpriced", async () => {
    const { t } = await world();
    await record(t);

    const [row] = await rows(t);
    expect(row.model).toBe(MODEL);
    expect(row.inputTokens).toBe(1_000);
    expect(row.outputTokens).toBe(500);
    expect(row.totalTokens).toBe(1_500);
    expect(row.day).toBe(dayKey(Date.now()));
    // No rate, so no cost — and specifically not a zero, which would report
    // this generation as free.
    expect(row.costMicroUsd).toBeUndefined();
  });

  test("derives the tenant and candidate from the conversation", async () => {
    const { t, ids } = await world();
    // The caller passes the conversation it is drafting for and nothing else:
    // asking it to pass the two ids hanging off that row would be two more
    // chances to bill the wrong matchmaker.
    await record(t, { conversationId: ids.conversationId });

    const [row] = await rows(t);
    expect(row.matchmakerId).toBe(ids.matchmakerId);
    expect(row.candidateId).toBe(ids.candidateId);
  });

  test("takes a matchmaker directly, for a run with no conversation", async () => {
    const { t, ids } = await world();
    await record(t, {
      agent: "voice_profile",
      matchmakerId: ids.matchmakerId,
    });

    const [row] = await rows(t);
    expect(row.matchmakerId).toBe(ids.matchmakerId);
    expect(row.candidateId).toBeUndefined();
  });

  test("records a probe with no tenant behind it", async () => {
    const { t } = await world();
    await record(t);
    const [row] = await rows(t);
    expect(row.matchmakerId).toBeUndefined();
  });

  test("prices it at the rate in force when it ran", async () => {
    const { t } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiModelRates", {
        model: MODEL,
        inputUsdPerMillion: 3,
        outputUsdPerMillion: 15,
        updatedAt: 1,
      });
    });
    await record(t, { inputTokens: 1_000, outputTokens: 500 });

    const [row] = await rows(t);
    expect(row.costMicroUsd).toBe(10_500); // $0.0105
  });

  test("a later rate change doesn't rewrite what a past run cost", async () => {
    const { t, ids } = await world();
    const rateId = await t.run(
      async (ctx) =>
        await ctx.db.insert("aiModelRates", {
          model: MODEL,
          inputUsdPerMillion: 3,
          outputUsdPerMillion: 15,
          updatedAt: 1,
        }),
    );
    await record(t);

    await t.run(async (ctx) => {
      await ctx.db.patch("aiModelRates", rateId, {
        inputUsdPerMillion: 30,
        outputUsdPerMillion: 150,
      });
    });
    await record(t, { conversationId: ids.conversationId });

    const costs = (await rows(t)).map((row) => row.costMicroUsd);
    expect(costs).toEqual([10_500, 105_000]);
  });
});

describe("the usage summary", () => {
  async function summary(
    t: Awaited<ReturnType<typeof world>>["t"],
    admin: Id<"users">,
    days = 7,
  ) {
    return await t
      .withIdentity({ subject: admin })
      .query(api.admin.queries.aiUsage, { days });
  }

  test("is admin-only", async () => {
    const { t } = await world();
    await expect(t.query(api.admin.queries.aiUsage, {})).rejects.toThrow();
  });

  test("adds up the window and says how much of it is unpriced", async () => {
    const { t, ids } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiModelRates", {
        model: MODEL,
        inputUsdPerMillion: 3,
        outputUsdPerMillion: 15,
        updatedAt: 1,
      });
    });
    await record(t, { conversationId: ids.conversationId });
    await record(t, {
      agent: "voice_profile",
      model: "anthropic/unpriced-1",
      matchmakerId: ids.matchmakerId,
    });

    const usage = await summary(t, ids.admin);
    expect(usage.total.generations).toBe(2);
    expect(usage.total.totalTokens).toBe(3_000);
    // Only the priced one is in the money, and `unpriced` is what stops the
    // figure being read as the whole bill.
    expect(usage.total.costMicroUsd).toBe(10_500);
    expect(usage.total.unpriced).toBe(1);
  });

  test("lists every agent, including the ones that ran nothing", async () => {
    const { t, ids } = await world();
    await record(t, { conversationId: ids.conversationId });

    const usage = await summary(t, ids.admin);
    expect(usage.byAgent.map((row) => row.key)).toEqual([
      "conversation",
      "candidate_profile",
      "voice_profile",
    ]);
    const quiet = usage.byAgent.find((row) => row.key === "voice_profile");
    expect(quiet?.generations).toBe(0);
  });

  test("groups by matchmaker, and keeps a probe out of anyone's book", async () => {
    const { t, ids } = await world();
    await record(t, { conversationId: ids.conversationId });
    await record(t); // a gateway probe: no tenant

    const usage = await summary(t, ids.admin);
    expect(usage.byMatchmaker).toHaveLength(1);
    expect(usage.byMatchmaker[0]?.label).toContain("Maya");
    expect(usage.byMatchmaker[0]?.generations).toBe(1);
    expect(usage.platform.generations).toBe(1);
  });

  test("offers a row for a model that has been configured but never run", async () => {
    // A rate should be enterable before the first bill, not after it.
    const { t, ids } = await world();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiAgentSettings", {
        agent: "conversation",
        enabled: true,
        model: "anthropic/claude-haiku-4-5",
        systemPrompt: "Draft replies.",
        updatedAt: 1,
      });
    });

    const usage = await summary(t, ids.admin);
    const row = usage.byModel.find(
      (model) => model.key === "anthropic/claude-haiku-4-5",
    );
    expect(row?.configured).toBe(true);
    expect(row?.generations).toBe(0);
    expect(row?.rate).toBeNull();
  });

  test("covers the window in whole UTC days, newest first", async () => {
    const { t, ids } = await world();
    const usage = await summary(t, ids.admin, 7);
    expect(usage.days).toBe(7);
    expect(usage.byDay).toHaveLength(7);
    expect(usage.byDay[0]?.key).toBe(dayKey(Date.now()));
  });

  test("leaves out a day older than the window", async () => {
    const { t, ids } = await world();
    await record(t, { conversationId: ids.conversationId });
    await t.run(async (ctx) => {
      await ctx.db.insert("aiGenerations", {
        agent: "conversation",
        model: MODEL,
        day: "2000-01-01",
        inputTokens: 9_000,
        outputTokens: 9_000,
        totalTokens: 18_000,
      });
    });

    const usage = await summary(t, ids.admin, 1);
    expect(usage.total.generations).toBe(1);
    expect(usage.total.totalTokens).toBe(1_500);
  });
});

describe("setting a model's rate", () => {
  function asAdmin(
    t: Awaited<ReturnType<typeof world>>["t"],
    admin: Id<"users">,
  ) {
    return t.withIdentity({ subject: admin });
  }

  test("is admin-only", async () => {
    const { t } = await world();
    await expect(
      t.mutation(api.admin.mutations.setAiModelRate, {
        model: MODEL,
        inputUsdPerMillion: "3",
        outputUsdPerMillion: "15",
      }),
    ).rejects.toThrow();
  });

  test("saves both rates and audits the change", async () => {
    const { t, ids } = await world();
    await asAdmin(t, ids.admin).mutation(api.admin.mutations.setAiModelRate, {
      model: MODEL,
      inputUsdPerMillion: "3",
      outputUsdPerMillion: "15",
      cachedInputUsdPerMillion: "0.3",
    });

    const [rate, events] = await t.run(async (ctx) => [
      await ctx.db.query("aiModelRates").unique(),
      await ctx.db.query("auditEvents").collect(),
    ]);
    expect(rate?.inputUsdPerMillion).toBe(3);
    expect(rate?.cachedInputUsdPerMillion).toBe(0.3);
    expect(events.map((event) => event.action)).toEqual([
      "ai_model_rate.updated",
    ]);
    // A platform-level event belongs to no matchmaker's book.
    expect(events[0].matchmakerId).toBeUndefined();
  });

  test("refuses one rate without the other", async () => {
    const { t, ids } = await world();
    await expect(
      asAdmin(t, ids.admin).mutation(api.admin.mutations.setAiModelRate, {
        model: MODEL,
        inputUsdPerMillion: "3",
        outputUsdPerMillion: "",
      }),
    ).rejects.toThrow(/both/);
  });

  test("clearing both rates leaves the model unpriced", async () => {
    const { t, ids } = await world();
    const admin = asAdmin(t, ids.admin);
    await admin.mutation(api.admin.mutations.setAiModelRate, {
      model: MODEL,
      inputUsdPerMillion: "3",
      outputUsdPerMillion: "15",
    });
    await admin.mutation(api.admin.mutations.setAiModelRate, {
      model: MODEL,
      inputUsdPerMillion: "",
      outputUsdPerMillion: "",
    });

    // The row goes rather than being left holding zeroes, which would price
    // every generation on this model as free.
    const rates = await t.run(
      async (ctx) => await ctx.db.query("aiModelRates").collect(),
    );
    expect(rates).toEqual([]);
    await record(t);
    const [row] = await rows(t);
    expect(row.costMicroUsd).toBeUndefined();
  });

  test("a save that changes nothing records nothing", async () => {
    const { t, ids } = await world();
    const admin = asAdmin(t, ids.admin);
    for (let i = 0; i < 2; i += 1) {
      await admin.mutation(api.admin.mutations.setAiModelRate, {
        model: MODEL,
        inputUsdPerMillion: "3",
        outputUsdPerMillion: "15",
      });
    }
    const events = await t.run(
      async (ctx) => await ctx.db.query("auditEvents").collect(),
    );
    expect(events).toHaveLength(1);
  });
});
