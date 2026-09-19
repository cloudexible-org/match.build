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

async function user(t: T, email: string, verified = true) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: email.split("@")[0],
      ...(verified ? { emailVerificationTime: 1 } : {}),
    }),
  );
}

async function matchmaker(t: T, ownerUserId: Id<"users">, username: string) {
  return await t.run((ctx) =>
    ctx.db.insert("matchmakers", {
      ownerUserId,
      username,
      usernameKey: username.replaceAll(".", ""),
      displayName: `${username} display`,
    }),
  );
}

/** A candidate onboarded by `matchmakerId`, with an open (or closed) invite. */
async function invite(
  t: T,
  matchmakerId: Id<"matchmakers">,
  email: string,
  open = true,
) {
  return await t.run((ctx) =>
    ctx.db.insert("candidates", {
      matchmakerId,
      email,
      socialHandles: [],
      membership: "invited",
      membershipChangedAt: 0,
      status: "active",
      ...(open
        ? {
            invite: {
              tokenHash: `hash-${matchmakerId}-${email}`,
              expiresAt: Number.MAX_SAFE_INTEGER,
            },
          }
        : {}),
    }),
  );
}

describe("users.queries.me", () => {
  test("is null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.queries.me, {})).toBeNull();
  });

  test("returns the account's name and email", async () => {
    const t = convexTest(schema, modules);
    const userId = await user(t, "jane@example.test");
    const me = await t
      .withIdentity({ subject: `${userId}|s` })
      .query(api.users.queries.me, {});
    expect(me).toEqual({
      _id: userId,
      name: "jane",
      email: "jane@example.test",
    });
  });
});

describe("users.queries.home", () => {
  test("lists owned profiles, joined matchmakers and pending invites for this email only", async () => {
    const t = convexTest(schema, modules);
    const me = await user(t, "jane@example.test");
    const other = await user(t, "other@example.test");

    const own = await matchmaker(t, me, "jane.matches");
    const joined = await matchmaker(t, other, "bea.intros");
    const left = await matchmaker(t, other, "cal.connects");
    const inviting = await matchmaker(t, other, "dee.dates");
    const expired = await matchmaker(t, other, "eve.expired");

    await t.run(async (ctx) => {
      for (const [matchmakerId, membership] of [
        [joined, "joined"],
        [left, "left"],
      ] as const) {
        await ctx.db.insert("candidates", {
          matchmakerId,
          userId: me,
          email: "jane@example.test",
          socialHandles: [],
          membership,
          membershipChangedAt: 0,
          status: "active",
        });
      }
    });
    const pending = await invite(t, inviting, "jane@example.test");
    await invite(t, inviting, "someone.else@example.test");
    // An expired or revoked invite (no `invite` left) is not shown.
    await invite(t, expired, "jane@example.test", false);
    // An invite from your own profile to your own email is not shown.
    await invite(t, own, "jane@example.test");

    const home = await t
      .withIdentity({ subject: `${me}|s` })
      .query(api.users.queries.home, {});

    expect(home).toEqual({
      matchmakerProfiles: [
        {
          matchmakerId: own,
          username: "jane.matches",
          displayName: "jane.matches display",
        },
      ],
      candidateProfiles: [
        {
          candidateId: expect.any(String),
          matchmakerUsername: "bea.intros",
          matchmakerDisplayName: "bea.intros display",
        },
      ],
      invitations: [
        {
          candidateId: pending,
          matchmakerDisplayName: "dee.dates display",
        },
      ],
    });
  });

  test("an unverified email claims no invitations", async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, "owner@example.test");
    const inviting = await matchmaker(t, owner, "dee.dates");
    await invite(t, inviting, "jane@example.test");

    const unverified = await user(t, "jane@example.test", false);
    const home = await t
      .withIdentity({ subject: `${unverified}|s` })
      .query(api.users.queries.home, {});
    expect(home?.invitations).toEqual([]);
  });

  test("is null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.queries.home, {})).toBeNull();
  });
});
