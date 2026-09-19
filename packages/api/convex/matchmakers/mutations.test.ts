/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

async function world() {
  const t = convexTest(schema, modules);
  const { owner, stranger } = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", { email: "owner@example.test" }),
    stranger: await ctx.db.insert("users", { email: "stranger@example.test" }),
  }));
  return {
    t,
    asOwner: t.withIdentity({ subject: `${owner}|s` }),
    asStranger: t.withIdentity({ subject: `${stranger}|s` }),
    owner,
  };
}

describe("matchmakers.create", () => {
  test("stores the chosen form and canonical key, and audits the creation", async () => {
    const { t, asOwner, owner } = await world();
    const created = await asOwner.mutation(api.matchmakers.mutations.create, {
      username: "  Jane.Smith ",
      displayName: " Jane   Smith ",
      businessName: "   ",
    });
    expect(created.username).toBe("jane.smith");

    const { profile, events } = await t.run(async (ctx) => ({
      profile: await ctx.db.get("matchmakers", created.matchmakerId),
      events: await ctx.db.query("auditEvents").collect(),
    }));
    expect(profile).toMatchObject({
      ownerUserId: owner,
      username: "jane.smith",
      usernameKey: "janesmith",
      displayName: "Jane Smith",
    });
    expect(profile?.businessName).toBeUndefined();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      matchmakerId: created.matchmakerId,
      actor: { type: "user", userId: owner, role: "matchmaker" },
      action: "matchmaker.created",
      entityTable: "matchmakers",
      entityId: created.matchmakerId,
      changes: [
        { field: "username", after: '"jane.smith"' },
        { field: "displayName", after: '"Jane Smith"' },
      ],
    });
    expect(events[0]?.candidateId).toBeUndefined();
  });

  test("refuses a username taken under any dot placement", async () => {
    const { asOwner, asStranger } = await world();
    await asOwner.mutation(api.matchmakers.mutations.create, {
      username: "jane.smith",
      displayName: "Jane",
    });
    await expect(
      asStranger.mutation(api.matchmakers.mutations.create, {
        username: "Janes.mith",
        displayName: "Impostor",
      }),
    ).rejects.toThrow("That username is taken.");
  });

  test("validates on the server and requires sign-in", async () => {
    const { t, asOwner } = await world();
    await expect(
      t.mutation(api.matchmakers.mutations.create, {
        username: "jane.smith",
        displayName: "Jane",
      }),
    ).rejects.toThrow("You need to sign in.");
    await expect(
      asOwner.mutation(api.matchmakers.mutations.create, {
        username: "no.reply",
        displayName: "Jane",
      }),
    ).rejects.toThrow("That username isn't available.");
    await expect(
      asOwner.mutation(api.matchmakers.mutations.create, {
        username: "jane.smith",
        displayName: " ",
      }),
    ).rejects.toThrow("Enter a display name.");
  });

  test("allows a second profile per account (the one-profile limit is UI-only)", async () => {
    const { asOwner } = await world();
    await asOwner.mutation(api.matchmakers.mutations.create, {
      username: "jane.smith",
      displayName: "Jane",
    });
    await expect(
      asOwner.mutation(api.matchmakers.mutations.create, {
        username: "jane.weddings",
        displayName: "Jane Weddings",
      }),
    ).resolves.toMatchObject({ username: "jane.weddings" });
  });
});

describe("matchmakers.update", () => {
  test("changes the display and business names, auditing only what changed", async () => {
    const { t, asOwner } = await world();
    const { matchmakerId } = await asOwner.mutation(
      api.matchmakers.mutations.create,
      { username: "jane.smith", displayName: "Jane" },
    );

    await asOwner.mutation(api.matchmakers.mutations.update, {
      matchmakerId,
      displayName: "Jane",
      businessName: " Smith  & Co ",
    });
    // No change → no event.
    await asOwner.mutation(api.matchmakers.mutations.update, {
      matchmakerId,
      displayName: " Jane ",
      businessName: "Smith & Co",
    });
    // Blank clears the business name.
    await asOwner.mutation(api.matchmakers.mutations.update, {
      matchmakerId,
      displayName: "Jane Smith",
      businessName: "",
    });

    const { profile, updates } = await t.run(async (ctx) => ({
      profile: await ctx.db.get("matchmakers", matchmakerId),
      updates: (await ctx.db.query("auditEvents").collect()).filter(
        (event) => event.action === "matchmaker.updated",
      ),
    }));
    expect(profile?.displayName).toBe("Jane Smith");
    expect(profile?.businessName).toBeUndefined();
    expect(updates.map((event) => event.changes)).toEqual([
      [{ field: "businessName", after: '"Smith & Co"' }],
      [
        { field: "displayName", before: '"Jane"', after: '"Jane Smith"' },
        { field: "businessName", before: '"Smith & Co"' },
      ],
    ]);
  });

  test("refuses anyone but the owner", async () => {
    const { asOwner, asStranger } = await world();
    const { matchmakerId } = await asOwner.mutation(
      api.matchmakers.mutations.create,
      { username: "jane.smith", displayName: "Jane" },
    );
    await expect(
      asStranger.mutation(api.matchmakers.mutations.update, {
        matchmakerId,
        displayName: "Hijacked",
        businessName: "",
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });
});
