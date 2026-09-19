/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

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
