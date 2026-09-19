/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

type T = ReturnType<typeof convexTest>;

async function seedMatchmaker(t: T, label: string) {
  return await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      email: `${label}@example.test`,
    });
    return await ctx.db.insert("matchmakers", {
      ownerUserId,
      username: `${label}.matches`,
      usernameKey: `${label}matches`,
      displayName: label,
    });
  });
}

async function addCandidate(
  t: T,
  matchmakerId: Id<"matchmakers">,
  userId: Id<"users">,
  membership: "joined" | "left",
) {
  return await t.run((ctx) =>
    ctx.db.insert("candidates", {
      matchmakerId,
      userId,
      email: "jane@example.test",
      socialHandles: [],
      membership,
      membershipChangedAt: 0,
      status: "active",
    }),
  );
}

describe("users.setName", () => {
  test("rejects a blank name and signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.mutations.setName, { name: "Jane" }),
    ).rejects.toThrow("You need to sign in.");

    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test" }),
    );
    await expect(
      t
        .withIdentity({ subject: `${userId}|s` })
        .mutation(api.users.mutations.setName, { name: "   " }),
    ).rejects.toThrow("Enter your name.");
  });

  test("normalises the name and audits it once per joined matchmaker, each in that matchmaker's trail", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test", name: "Jane" }),
    );
    const joinedA = await seedMatchmaker(t, "alpha");
    const joinedB = await seedMatchmaker(t, "bravo");
    const left = await seedMatchmaker(t, "charlie");
    const candidateA = await addCandidate(t, joinedA, userId, "joined");
    const candidateB = await addCandidate(t, joinedB, userId, "joined");
    await addCandidate(t, left, userId, "left");

    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(api.users.mutations.setName, { name: "  Jane   Doe " });

    const user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.name).toBe("Jane Doe");

    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    const change = [{ field: "name", before: '"Jane"', after: '"Jane Doe"' }];
    expect(events).toHaveLength(3);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "account.name_changed",
          actor: { type: "user", userId, role: "account" },
          changes: change,
        }),
        expect.objectContaining({
          matchmakerId: joinedA,
          candidateId: candidateA,
          actor: { type: "user", userId, role: "candidate" },
          changes: change,
        }),
        expect.objectContaining({
          matchmakerId: joinedB,
          candidateId: candidateB,
        }),
      ]),
    );
    // Exactly one account-level copy, in no matchmaker's trail.
    expect(
      events.filter((event) => event.matchmakerId === undefined),
    ).toHaveLength(1);
    // The matchmaker the person left learns nothing.
    expect(events.some((event) => event.matchmakerId === left)).toBe(false);
  });

  test("setting the same name again is a no-op", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test", name: "Jane" }),
    );
    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(api.users.mutations.setName, { name: " Jane " });
    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(events).toHaveLength(0);
  });
});
