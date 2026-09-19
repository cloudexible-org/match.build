/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { requireCandidateSelf } from "../candidates/helpers";
import schema from "../schema";
import { assertSameTenant, requireMatchmaker } from "./helpers";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "owner@example.test" });
    const stranger = await ctx.db.insert("users", {
      email: "stranger@example.test",
    });
    const member = await ctx.db.insert("users", {
      email: "member@example.test",
    });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "owner.matches",
      usernameKey: "ownermatches",
      displayName: "Owner",
    });
    const candidateId = await ctx.db.insert("candidates", {
      matchmakerId,
      userId: member,
      email: "member@example.test",
      socialHandles: [],
      membership: "joined",
      membershipChangedAt: 0,
      status: "active",
    });
    return { owner, stranger, member, matchmakerId, candidateId };
  });
  return { t, ...ids };
}

describe("requireMatchmaker", () => {
  test("admits the owner", async () => {
    const { t, owner, matchmakerId } = await world();
    const { matchmaker } = await t
      .withIdentity({ subject: `${owner}|s` })
      .run((ctx) => requireMatchmaker(ctx, matchmakerId));
    expect(matchmaker._id).toBe(matchmakerId);
  });

  test("refuses anyone else with the same error as a missing profile", async () => {
    const { t, stranger, member, matchmakerId } = await world();
    for (const userId of [stranger, member]) {
      await expect(
        t
          .withIdentity({ subject: `${userId}|s` })
          .run((ctx) => requireMatchmaker(ctx, matchmakerId)),
      ).rejects.toThrow("Matchmaker profile not found.");
    }
  });
});

describe("assertSameTenant", () => {
  test("throws for a document from another tenant or a missing one", async () => {
    const { t, matchmakerId, candidateId } = await world();
    const candidate = await t.run((ctx) =>
      ctx.db.get("candidates", candidateId),
    );
    expect(() => assertSameTenant(candidate, matchmakerId)).not.toThrow();

    const otherTenant = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", {});
      return await ctx.db.insert("matchmakers", {
        ownerUserId: owner,
        username: "other.matches",
        usernameKey: "othermatches",
        displayName: "Other",
      });
    });
    expect(() => assertSameTenant(candidate, otherTenant)).toThrow(
      "Not found.",
    );
    expect(() => assertSameTenant(null, matchmakerId)).toThrow("Not found.");
  });
});

describe("requireCandidateSelf", () => {
  test("admits the linked account while it is a member", async () => {
    const { t, member, candidateId } = await world();
    const { candidate } = await t
      .withIdentity({ subject: `${member}|s` })
      .run((ctx) => requireCandidateSelf(ctx, candidateId));
    expect(candidate._id).toBe(candidateId);
  });

  test("refuses the matchmaker and strangers", async () => {
    const { t, owner, stranger, candidateId } = await world();
    for (const userId of [owner, stranger]) {
      await expect(
        t
          .withIdentity({ subject: `${userId}|s` })
          .run((ctx) => requireCandidateSelf(ctx, candidateId)),
      ).rejects.toThrow("Conversation not found.");
    }
  });

  test("closes the conversation once the candidate has left", async () => {
    const { t, member, candidateId } = await world();
    await t.run((ctx) =>
      ctx.db.patch("candidates", candidateId, { membership: "left" }),
    );
    await expect(
      t
        .withIdentity({ subject: `${member}|s` })
        .run((ctx) => requireCandidateSelf(ctx, candidateId)),
    ).rejects.toThrow("Conversation not found.");
  });
});
