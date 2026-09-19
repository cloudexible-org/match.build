/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { hashInviteToken } from "../invites/helpers";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

beforeEach(() => {
  vi.stubEnv("INVITE_LINK_SECRET", "test-invite-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "owner@example.test" });
    const other = await ctx.db.insert("users", { email: "other@example.test" });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "owner.matches",
      usernameKey: "ownermatches",
      displayName: "Owner",
    });
    const otherMatchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: other,
      username: "other.matches",
      usernameKey: "othermatches",
      displayName: "Other",
    });
    return { owner, other, matchmakerId, otherMatchmakerId };
  });
  const asOwner = t.withIdentity({ subject: `${ids.owner}|s` });
  const asOther = t.withIdentity({ subject: `${ids.other}|s` });
  const onboard = (email: string, importedHistory?: string) =>
    asOwner.mutation(api.candidates.mutations.onboard, {
      matchmakerId: ids.matchmakerId,
      email,
      socialHandles: [],
      importedHistory,
    });
  return { t, ...ids, asOwner, asOther, onboard };
}

describe("candidates.list", () => {
  test("lists this workspace's candidates with the status, newest first", async () => {
    const { t, asOwner, asOther, onboard, matchmakerId, otherMatchmakerId } =
      await world();
    const jane = await onboard("jane@example.test");
    const sam = await onboard("sam@example.test");
    await t.run((ctx) =>
      ctx.db.patch("candidates", sam.candidateId, { status: "archived" }),
    );
    const kim = await onboard("kim@example.test");
    // The other matchmaker's candidate never appears here.
    await asOther.mutation(api.candidates.mutations.onboard, {
      matchmakerId: otherMatchmakerId,
      email: "jane@example.test",
      socialHandles: [],
    });

    const active = await asOwner.query(api.candidates.queries.list, {
      matchmakerId,
      status: "active",
    });
    expect(active.map((row) => row.candidateId)).toEqual([
      kim.candidateId,
      jane.candidateId,
    ]);
    expect(active[0]).toMatchObject({
      email: "kim@example.test",
      membership: "invited",
    });
    const archived = await asOwner.query(api.candidates.queries.list, {
      matchmakerId,
      status: "archived",
    });
    expect(archived.map((row) => row.candidateId)).toEqual([sam.candidateId]);

    await expect(
      asOther.query(api.candidates.queries.list, {
        matchmakerId,
        status: "active",
      }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });

  test("falls back to the linked account's name once they've joined", async () => {
    const { t, asOwner, onboard, matchmakerId } = await world();
    const { candidateId } = await onboard("jane@example.test");
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "jane@example.test",
        name: "Jane From Her Account",
      });
      await ctx.db.patch("candidates", candidateId, {
        userId,
        membership: "joined",
      });
    });
    const [row] = await asOwner.query(api.candidates.queries.list, {
      matchmakerId,
      status: "active",
    });
    expect(row?.name).toBe("Jane From Her Account");
  });
});

describe("candidates.conversation", () => {
  test("returns the candidate, invite state and private history to the owner", async () => {
    const { asOwner, onboard, matchmakerId } = await world();
    const { candidateId } = await onboard("jane@example.test", "Jane: hi");
    const view = await asOwner.query(api.candidates.queries.conversation, {
      matchmakerId,
      candidateId,
    });
    expect(view?.candidate).toMatchObject({
      candidateId,
      email: "jane@example.test",
      membership: "invited",
      invite: { copyable: true },
    });
    const thread = await asOwner.query(api.messages.queries.thread, {
      matchmakerId,
      candidateId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(thread.page).toMatchObject([
      {
        seq: 1,
        visibility: "matchmaker",
        source: "imported",
        body: "Jane: hi",
      },
    ]);
  });

  test("another tenant's candidate, an unknown id and a malformed one all answer null", async () => {
    const { t, asOwner, asOther, onboard, matchmakerId, otherMatchmakerId } =
      await world();
    const { candidateId } = await onboard("jane@example.test");
    const conversation = api.candidates.queries.conversation;
    expect(
      await asOther.query(conversation, {
        matchmakerId: otherMatchmakerId,
        candidateId,
      }),
    ).toBeNull();
    const deletedId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("candidates", {
        matchmakerId,
        email: "gone@example.test",
        socialHandles: [],
        membership: "invited",
        membershipChangedAt: 0,
        status: "active",
      });
      await ctx.db.delete("candidates", id);
      return id;
    });
    expect(
      await asOwner.query(conversation, {
        matchmakerId,
        candidateId: deletedId,
      }),
    ).toBeNull();
    expect(
      await asOwner.query(conversation, {
        matchmakerId,
        candidateId: "not-an-id",
      }),
    ).toBeNull();
    // The workspace itself is still checked.
    await expect(
      asOther.query(conversation, { matchmakerId, candidateId }),
    ).rejects.toThrow("Matchmaker profile not found.");
  });
});

describe("invites.token", () => {
  test("re-derives the same token for the owner, matching the stored hash", async () => {
    const { t, asOwner, onboard, matchmakerId } = await world();
    const { candidateId } = await onboard("jane@example.test");
    const args = { matchmakerId, candidateId };
    const token = await asOwner.query(api.invites.queries.token, args);
    if (token === null) throw new Error("expected a token");
    expect(await asOwner.query(api.invites.queries.token, args)).toBe(token);

    const stored = await t.run((ctx) => ctx.db.get("candidates", candidateId));
    expect(stored?.invite?.tokenHash).toBe(await hashInviteToken(token));
  });

  test("is null without an open invite, and refused to other matchmakers", async () => {
    const { t, asOwner, asOther, onboard, matchmakerId, otherMatchmakerId } =
      await world();
    const { candidateId } = await onboard("jane@example.test");
    await expect(
      asOther.query(api.invites.queries.token, {
        matchmakerId: otherMatchmakerId,
        candidateId,
      }),
    ).rejects.toThrow("Not found.");

    await t.run((ctx) =>
      ctx.db.patch("candidates", candidateId, { invite: undefined }),
    );
    expect(
      await asOwner.query(api.invites.queries.token, {
        matchmakerId,
        candidateId,
      }),
    ).toBeNull();
  });
});
