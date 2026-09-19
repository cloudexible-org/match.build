/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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

const FIRST_PAGE = { numItems: 50, cursor: null };

/**
 * Two matchmakers, each with a candidate, and a hand-written trail:
 *
 *   jane  — matchmaker.created, candidate.created (sam), note.created (sam)
 *   bea   — matchmaker.created, candidate.created (kim)
 *   sam   — account.name_changed (account-level, no matchmaker)
 */
async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (email: string, name?: string) =>
      ctx.db.insert("users", { email, name, emailVerificationTime: 1 });
    const admin = await user("admin@example.test");
    const jane = await user("jane@example.test", "Jane");
    const bea = await user("bea@example.test", "Bea");
    const sam = await user("sam@example.test", "Sam");

    const matchmaker = (ownerUserId: Id<"users">, username: string) =>
      ctx.db.insert("matchmakers", {
        ownerUserId,
        username,
        usernameKey: username.replaceAll(".", ""),
        displayName: username,
      });
    const janeMm = await matchmaker(jane, "jane.matches");
    const beaMm = await matchmaker(bea, "bea.matches");

    const candidate = (matchmakerId: Id<"matchmakers">, email: string) =>
      ctx.db.insert("candidates", {
        matchmakerId,
        email,
        socialHandles: [],
        membership: "invited",
        membershipChangedAt: 0,
        status: "active",
      });
    const samCandidate = await candidate(janeMm, "sam@example.test");
    const kimCandidate = await candidate(beaMm, "kim@example.test");

    const event = (
      action: string,
      userId: Id<"users">,
      rest: {
        matchmakerId?: Id<"matchmakers">;
        candidateId?: Id<"candidates">;
        entity: [string, string];
      },
    ) =>
      ctx.db.insert("auditEvents", {
        matchmakerId: rest.matchmakerId,
        candidateId: rest.candidateId,
        actor: { type: "user", userId, role: "matchmaker" },
        action,
        entityTable: rest.entity[0],
        entityId: rest.entity[1],
      });
    await event("matchmaker.created", jane, {
      matchmakerId: janeMm,
      entity: ["matchmakers", janeMm],
    });
    await event("candidate.created", jane, {
      matchmakerId: janeMm,
      candidateId: samCandidate,
      entity: ["candidates", samCandidate],
    });
    await event("note.created", jane, {
      matchmakerId: janeMm,
      candidateId: samCandidate,
      entity: ["notes", "n1"],
    });
    await event("matchmaker.created", bea, {
      matchmakerId: beaMm,
      entity: ["matchmakers", beaMm],
    });
    await event("candidate.created", bea, {
      matchmakerId: beaMm,
      candidateId: kimCandidate,
      entity: ["candidates", kimCandidate],
    });
    await event("account.name_changed", sam, { entity: ["users", sam] });

    return { admin, jane, bea, sam, janeMm, beaMm, samCandidate };
  });
  return {
    t,
    ids,
    asAdmin: t.withIdentity({ subject: `${ids.admin}|s` }),
    asJane: t.withIdentity({ subject: `${ids.jane}|s` }),
  };
}

describe("admin.me", () => {
  test("says whether the signed-in account is an admin", async () => {
    const { t, asAdmin, asJane } = await world();
    expect(await asAdmin.query(api.admin.queries.me, {})).toMatchObject({
      email: "admin@example.test",
      isAdmin: true,
    });
    expect(await asJane.query(api.admin.queries.me, {})).toMatchObject({
      name: "Jane",
      isAdmin: false,
    });
    expect(await t.query(api.admin.queries.me, {})).toBeNull();
  });
});

describe("admin.auditTrail", () => {
  async function actions(
    asAdmin: Awaited<ReturnType<typeof world>>["asAdmin"],
    filters: {
      matchmakerId?: Id<"matchmakers">;
      candidateId?: Id<"candidates">;
      actorUserId?: Id<"users">;
      action?: string;
    },
  ) {
    const result = await asAdmin.query(api.admin.queries.auditTrail, {
      paginationOpts: FIRST_PAGE,
      ...filters,
    });
    return result.page.map((row) => row.action);
  }

  test("lists every tenant's events newest first, with labels", async () => {
    const { asAdmin, ids } = await world();
    const result = await asAdmin.query(api.admin.queries.auditTrail, {
      paginationOpts: FIRST_PAGE,
    });
    expect(result.page.map((row) => row.action)).toEqual([
      "account.name_changed",
      "candidate.created",
      "matchmaker.created",
      "note.created",
      "candidate.created",
      "matchmaker.created",
    ]);
    expect(result.page[0]).toMatchObject({
      actorLabel: "Sam",
      matchmaker: null,
      candidate: null,
      accountLabel: "Sam",
    });
    expect(result.page[3]).toMatchObject({
      actorLabel: "Jane",
      matchmaker: { _id: ids.janeMm, username: "jane.matches" },
      candidate: { _id: ids.samCandidate, label: "sam@example.test" },
      accountLabel: null,
    });
  });

  test("narrows by matchmaker, candidate, account and action, alone or combined", async () => {
    const { asAdmin, ids } = await world();
    expect(await actions(asAdmin, { matchmakerId: ids.janeMm })).toEqual([
      "note.created",
      "candidate.created",
      "matchmaker.created",
    ]);
    expect(await actions(asAdmin, { candidateId: ids.samCandidate })).toEqual([
      "note.created",
      "candidate.created",
    ]);
    expect(await actions(asAdmin, { actorUserId: ids.bea })).toEqual([
      "candidate.created",
      "matchmaker.created",
    ]);
    expect(await actions(asAdmin, { action: "matchmaker.created" })).toEqual([
      "matchmaker.created",
      "matchmaker.created",
    ]);
    expect(
      await actions(asAdmin, {
        matchmakerId: ids.janeMm,
        action: "candidate.created",
      }),
    ).toEqual(["candidate.created"]);
    expect(
      await actions(asAdmin, {
        candidateId: ids.samCandidate,
        action: "note.created",
      }),
    ).toEqual(["note.created"]);
    expect(
      await actions(asAdmin, {
        actorUserId: ids.jane,
        action: "matchmaker.created",
      }),
    ).toEqual(["matchmaker.created"]);
  });

  test("refuses a matchmaker and an account together", async () => {
    const { asAdmin, ids } = await world();
    await expect(
      actions(asAdmin, { matchmakerId: ids.janeMm, actorUserId: ids.jane }),
    ).rejects.toThrow("not both");
  });

  test("is for platform admins only", async () => {
    const { t, asJane } = await world();
    const args = { paginationOpts: FIRST_PAGE };
    await expect(
      asJane.query(api.admin.queries.auditTrail, args),
    ).rejects.toThrow("isn't a platform admin");
    await expect(t.query(api.admin.queries.auditTrail, args)).rejects.toThrow(
      "sign in",
    );
  });
});

describe("admin pickers", () => {
  test("list matchmakers, a matchmaker's candidates, and accounts by email prefix", async () => {
    const { asAdmin, asJane, ids } = await world();
    expect(
      (await asAdmin.query(api.admin.queries.matchmakers, {})).map(
        (row) => row.username,
      ),
    ).toEqual(["bea.matches", "jane.matches"]);
    expect(
      await asAdmin.query(api.admin.queries.candidates, {
        matchmakerId: ids.janeMm,
      }),
    ).toEqual([
      {
        _id: ids.samCandidate,
        label: "sam@example.test",
        email: "sam@example.test",
      },
    ]);
    expect(
      (
        await asAdmin.query(api.admin.queries.searchAccounts, { search: "J" })
      ).map((row) => row.email),
    ).toEqual([]);
    expect(
      (
        await asAdmin.query(api.admin.queries.searchAccounts, { search: " JA" })
      ).map((row) => row.email),
    ).toEqual(["jane@example.test"]);
    expect(
      await asAdmin.query(api.admin.queries.account, { userId: ids.sam }),
    ).toMatchObject({ email: "sam@example.test", verified: true });

    await expect(
      asJane.query(api.admin.queries.searchAccounts, { search: "sam" }),
    ).rejects.toThrow("isn't a platform admin");
  });
});
