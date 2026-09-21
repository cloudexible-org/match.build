/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import { hashInviteToken } from "../../invites/helpers";
import schema from "../../schema";

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

/** The scenario every e2e spec file asks for, in miniature. */
const spec = {
  ns: "abcd1234",
  users: [{ key: "maya" }, { key: "jane", name: "Jane Member" }],
  matchmakers: [{ key: "book", ownerKey: "maya" }],
  candidates: [
    {
      key: "member",
      matchmakerKey: "book",
      userKey: "jane",
      membership: "joined" as const,
      messages: [
        { author: "matchmaker" as const, body: "Welcome" },
        {
          author: "matchmaker" as const,
          visibility: "matchmaker" as const,
          source: "imported" as const,
          body: "Private history",
        },
      ],
      notes: ["A note"],
    },
    { key: "invited", matchmakerKey: "book", invitesSentToday: 2 },
    { key: "stale", matchmakerKey: "book", invite: "expired" as const },
  ],
};

describe("seed.e2e.scenario", () => {
  test("namespaces what it writes and reports it back", async () => {
    const t = convexTest(schema, modules);
    const world = await t.mutation(internal.seed.e2e.mutations.scenario, spec);

    expect(world.users.maya.email).toBe("maya.abcd1234@matchmaker-e2e.test");
    expect(world.users.jane.name).toBe("Jane Member");
    expect(world.matchmakers.book.username).toBe("abcd1234.book");
    expect(world.candidates.member.email).toBe(world.users.jane.email);

    // The invited candidate's token is the real one: its hash is what the
    // link lookup will match.
    const token = world.candidates.invited.inviteToken;
    if (token === null) throw new Error("expected an invite token");
    const stored = await t.run((ctx) =>
      ctx.db.get("candidates", world.candidates.invited.id as never),
    );
    expect(stored?.invite?.tokenHash).toBe(await hashInviteToken(token));
    expect(world.candidates.member.inviteToken).toBeNull();
  });

  test("writes the rows and audit events the product would have", async () => {
    const t = convexTest(schema, modules);
    const world = await t.mutation(internal.seed.e2e.mutations.scenario, spec);
    const asMaya = t.withIdentity({ subject: `${world.users.maya.id}|s` });

    // The seeded world reads back through the app's own queries.
    const view = await asMaya.query(api.candidates.queries.conversation, {
      matchmakerId: world.matchmakers.book.id as never,
      candidateId: world.candidates.member.id,
    });
    expect(view?.candidate.membership).toBe("joined");
    const thread = await asMaya.query(api.messages.queries.thread, {
      matchmakerId: world.matchmakers.book.id as never,
      candidateId: world.candidates.member.id as never,
      paginationOpts: { numItems: 10, cursor: null },
    });
    // Newest first, so the private history the seed wrote second leads.
    expect(thread.page.map((item) => item.visibility)).toEqual([
      "matchmaker",
      "everyone",
    ]);

    // The profile's own audit trail, read from the table: nothing in the app
    // renders it any more, but seeding still has to write it.
    const history = await t.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entityTable_and_entityId", (q) =>
          q
            .eq("entityTable", "matchmakers")
            .eq("entityId", world.matchmakers.book.id as never),
        )
        .collect(),
    );
    expect(history.map((event) => event.action)).toEqual([
      "matchmaker.created",
    ]);

    // `invitesSentToday` feeds the resend limit, which counts audit events.
    const sends = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_candidateId", (q) =>
            q.eq("candidateId", world.candidates.invited.id as never),
          )
          .take(20)
      ).filter((event) => event.action === "invite.sent"),
    );
    expect(sends).toHaveLength(2);
  });

  test("an expired invite keeps a real link that no longer works", async () => {
    const t = convexTest(schema, modules);
    const world = await t.mutation(internal.seed.e2e.mutations.scenario, spec);
    const token = world.candidates.stale.inviteToken;
    if (token === null) throw new Error("expected an invite token");

    const asJane = t.withIdentity({ subject: `${world.users.jane.id}|s` });
    await expect(
      asJane.mutation(api.invites.mutations.accept, { token }),
    ).rejects.toThrow("This invitation isn't valid any more.");
  });

  test("refuses a namespace that would break emails or usernames", async () => {
    const t = convexTest(schema, modules);
    for (const ns of ["", "ab", "Has.Dots", "1starts-with-digit"]) {
      await expect(
        t.mutation(internal.seed.e2e.mutations.scenario, { ...spec, ns }),
      ).rejects.toThrow("must be 4–12 lowercase letters/digits");
    }
  });
});
