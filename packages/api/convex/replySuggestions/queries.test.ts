/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  // `activeAgent` answers null without it, and `draftContext` returns before
  // it ever builds the object whose shape is under test.
  vi.stubEnv("AI_ENABLED", "true");
});

/**
 * A conversation the drafting agent would really run on: an agent configured
 * and on, a joined candidate whose profile is half filled in, and a matchmaker
 * who has described their practice.
 */
async function world() {
  const t = convexTest(schema, modules);
  const conversationId = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "maya@example.test" });
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
      authorUserId: member,
      visibility: "everyone",
      source: "typed",
      body: "Hi Maya!",
      sentAt: 1,
    });
    await ctx.db.insert("aiAgentSettings", {
      agent: "conversation",
      enabled: true,
      model: "test/model",
      systemPrompt: "Draft replies.",
      updatedAt: 1,
    });
    // One fact filled, so every other match-critical field is a gap.
    await ctx.db.insert("candidateProfiles", {
      matchmakerId,
      candidateId,
      facts: {
        occupation: { value: "Architect", source: "matchmaker", updatedAt: 2 },
      },
      notes: {},
      updatedAt: 2,
    });
    await ctx.db.insert("matchmakerProfiles", {
      matchmakerId,
      voice: { value: "Warm, brief.", source: "matchmaker", updatedAt: 3 },
      whoYouWorkWith: {
        value: "Professionals in London.",
        source: "matchmaker",
        updatedAt: 3,
      },
      howYouWork: {
        value: "A call first, then introductions by email.",
        source: "matchmaker",
        updatedAt: 4,
      },
      updatedAt: 4,
    });
    return conversationId;
  });
  return { t, conversationId };
}

describe("draftContext", () => {
  // Every field of the brief crosses the `returns` validator. One the
  // validator did not declare failed every drafting run in production.
  test("returns a brief carrying the profile's gaps and the practice", async () => {
    const { t, conversationId } = await world();

    const context = await t.query(
      internal.replySuggestions.queries.draftContext,
      { conversationId },
    );

    expect(context).not.toBeNull();
    expect(context?.brief.gaps.length).toBeGreaterThan(0);
    expect(context?.brief.gaps).not.toContain("Occupation");
    expect(context?.brief.practice).toEqual([
      { label: "Who you work with", value: "Professionals in London." },
      {
        label: "How you work",
        value: "A call first, then introductions by email.",
      },
    ]);
    expect(context?.brief.facts.map((fact) => fact.key)).toEqual([
      "occupation",
    ]);
    expect(context?.brief.messages.map((message) => message.body)).toEqual([
      "Hi Maya!",
    ]);
    expect(context?.voiceAt).toBe(4);
  });
});
