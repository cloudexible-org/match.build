/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { requireUser, upsertAuthUser } from "./helpers";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

describe("upsertAuthUser (Convex Auth's createOrUpdateUser)", () => {
  test("requesting a code creates an unverified user; verifying marks it and audits account.created", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) =>
      upsertAuthUser(ctx, {
        existingUserId: null,
        type: "email",
        profile: { email: " Jane@Example.test " },
      }),
    );
    let user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.email).toBe("jane@example.test");
    expect(user?.emailVerificationTime).toBeUndefined();

    const verifiedId = await t.run((ctx) =>
      upsertAuthUser(ctx, {
        existingUserId: userId,
        type: "verification",
        profile: { email: "jane@example.test", emailVerified: true },
      }),
    );
    expect(verifiedId).toBe(userId);
    user = await t.run((ctx) => ctx.db.get("users", userId));
    expect(user?.emailVerificationTime).toBeTypeOf("number");

    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(events).toMatchObject([
      { action: "account.created", entityId: userId },
    ]);
    // Account-level: in no matchmaker's trail.
    expect(events[0].matchmakerId).toBeUndefined();
  });

  test("re-verifying an account does not audit it again", async () => {
    const t = convexTest(schema, modules);
    const args = {
      type: "verification" as const,
      profile: { email: "jane@example.test", emailVerified: true },
    };
    const userId = await t.run((ctx) =>
      upsertAuthUser(ctx, { ...args, existingUserId: null }),
    );
    await t.run((ctx) =>
      upsertAuthUser(ctx, { ...args, existingUserId: userId }),
    );

    const events = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(events).toHaveLength(1);
  });

  test("an unlinked sign-in attaches to the existing account with that email", async () => {
    const t = convexTest(schema, modules);
    const existing = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "jane@example.test",
        emailVerificationTime: 1,
      }),
    );
    const userId = await t.run((ctx) =>
      upsertAuthUser(ctx, {
        existingUserId: null,
        type: "email",
        profile: { email: "JANE@example.test" },
      }),
    );
    expect(userId).toBe(existing);
  });

  test("a deleted account is never reused: the same email gets a fresh user", async () => {
    const t = convexTest(schema, modules);
    const deleted = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "jane@example.test",
        emailVerificationTime: 1,
        deletedAt: 2,
      }),
    );

    const viaEmail = await t.run((ctx) =>
      upsertAuthUser(ctx, {
        existingUserId: null,
        type: "email",
        profile: { email: "jane@example.test" },
      }),
    );
    expect(viaEmail).not.toBe(deleted);

    // Even if a stale auth account still pointed at the deleted user.
    const viaStaleAccount = await t.run((ctx) =>
      upsertAuthUser(ctx, {
        existingUserId: deleted,
        type: "email",
        profile: { email: "jane@example.test" },
      }),
    );
    expect(viaStaleAccount).toBe(viaEmail);
  });
});

describe("requireUser", () => {
  test("rejects signed-out callers and deleted accounts", async () => {
    const t = convexTest(schema, modules);
    await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow(
      "You need to sign in.",
    );

    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test", deletedAt: 1 }),
    );
    await expect(
      t
        .withIdentity({ subject: `${userId}|session` })
        .run((ctx) => requireUser(ctx)),
    ).rejects.toThrow("You need to sign in.");
  });

  test("returns the signed-in user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "jane@example.test" }),
    );
    const user = await t
      .withIdentity({ subject: `${userId}|session` })
      .run((ctx) => requireUser(ctx));
    expect(user._id).toBe(userId);
  });
});
