/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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

async function world() {
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(internal.seed.e2e.mutations.scenario, {
    ns: "notestest",
    users: [{ key: "maya" }, { key: "rival" }],
    matchmakers: [
      { key: "book", ownerKey: "maya" },
      { key: "rivalbook", ownerKey: "rival" },
    ],
    candidates: [{ key: "jane", matchmakerKey: "book", name: "Jane" }],
  });
  return {
    t,
    matchmakerId: seeded.matchmakers.book.id as Id<"matchmakers">,
    rivalMatchmakerId: seeded.matchmakers.rivalbook.id as Id<"matchmakers">,
    candidateId: seeded.candidates.jane.id as Id<"candidates">,
    asMaya: t.withIdentity({ subject: `${seeded.users.maya.id}|s` }),
    asRival: t.withIdentity({ subject: `${seeded.users.rival.id}|s` }),
  };
}

describe("notes", () => {
  test("are written, edited and removed, each audited", async () => {
    const w = await world();
    const noteId = await w.asMaya.mutation(api.notes.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      body: "  Prefers mornings.\r\nLikes hiking.  ",
    });

    const list = () =>
      w.asMaya.query(api.notes.queries.list, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
      });
    expect(await list()).toMatchObject([
      { body: "Prefers mornings.\nLikes hiking." },
    ]);

    await w.asMaya.mutation(api.notes.mutations.edit, {
      matchmakerId: w.matchmakerId,
      noteId,
      body: "Prefers mornings.",
    });
    expect(await list()).toMatchObject([{ body: "Prefers mornings." }]);

    await w.asMaya.mutation(api.notes.mutations.remove, {
      matchmakerId: w.matchmakerId,
      noteId,
    });
    expect(await list()).toEqual([]);

    // Nothing is deleted: the row stays, with the trail to match.
    const row = await w.t.run((ctx) => ctx.db.get("notes", noteId));
    expect(row?.removedAt).toBeDefined();
    const history = await w.asMaya.query(api.audit.queries.candidateHistory, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      filter: "notes",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(history.page.map((event) => event.action)).toEqual([
      "note.removed",
      "note.edited",
      "note.created",
    ]);
  });

  test("are validated, and a removed one can't be edited", async () => {
    const w = await world();
    await expect(
      w.asMaya.mutation(api.notes.mutations.create, {
        matchmakerId: w.matchmakerId,
        candidateId: w.candidateId,
        body: "   ",
      }),
    ).rejects.toThrow("Write something first.");

    const noteId = await w.asMaya.mutation(api.notes.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      body: "Keep",
    });
    await w.asMaya.mutation(api.notes.mutations.remove, {
      matchmakerId: w.matchmakerId,
      noteId,
    });
    await expect(
      w.asMaya.mutation(api.notes.mutations.edit, {
        matchmakerId: w.matchmakerId,
        noteId,
        body: "Changed my mind",
      }),
    ).rejects.toThrow("That note was removed.");
  });

  test("belong to one matchmaker only", async () => {
    const w = await world();
    const noteId = await w.asMaya.mutation(api.notes.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      body: "Private",
    });
    // Through their own workspace, the rival still can't touch it.
    await expect(
      w.asRival.mutation(api.notes.mutations.edit, {
        matchmakerId: w.rivalMatchmakerId,
        noteId,
        body: "Mine now",
      }),
    ).rejects.toThrow("Not found.");
    await expect(
      w.asRival.query(api.notes.queries.list, {
        matchmakerId: w.rivalMatchmakerId,
        candidateId: w.candidateId,
      }),
    ).rejects.toThrow("Not found.");
  });
});

describe("candidate details and status", () => {
  test("update the record and the trail, and ignore a no-op", async () => {
    const w = await world();
    const args = { matchmakerId: w.matchmakerId, candidateId: w.candidateId };
    await w.asMaya.mutation(api.candidates.mutations.updateDetails, {
      ...args,
      name: "  Jane   Doe ",
      socialHandles: [{ platform: "instagram", handle: "@jane.doe" }],
    });
    await w.asMaya.mutation(api.candidates.mutations.setStatus, {
      ...args,
      status: "paused",
    });
    // Setting what is already set records nothing.
    await w.asMaya.mutation(api.candidates.mutations.setStatus, {
      ...args,
      status: "paused",
    });

    const candidate = await w.t.run((ctx) =>
      ctx.db.get("candidates", w.candidateId),
    );
    expect(candidate).toMatchObject({
      name: "Jane Doe",
      status: "paused",
      socialHandles: [{ platform: "instagram", handle: "jane.doe" }],
    });

    const history = await w.asMaya.query(api.audit.queries.candidateHistory, {
      ...args,
      filter: "details",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(history.page.map((event) => event.action)).toEqual([
      "candidate.status_changed",
      "candidate.details_changed",
      "candidate.created",
    ]);
    expect(history.page[0]?.changes).toEqual([
      { field: "status", before: '"active"', after: '"paused"' },
    ]);
  });

  test("are refused to another matchmaker", async () => {
    const w = await world();
    await expect(
      w.asRival.mutation(api.candidates.mutations.setStatus, {
        matchmakerId: w.rivalMatchmakerId,
        candidateId: w.candidateId,
        status: "archived",
      }),
    ).rejects.toThrow("Not found.");
  });
});

describe("candidate history", () => {
  test("names who did what, and filters by area", async () => {
    const w = await world();
    const args = { matchmakerId: w.matchmakerId, candidateId: w.candidateId };
    await w.asMaya.mutation(api.notes.mutations.create, {
      ...args,
      body: "A note",
    });

    const all = await w.asMaya.query(api.audit.queries.candidateHistory, {
      ...args,
      filter: "all",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(all.page[0]).toMatchObject({
      action: "note.created",
      actor: { kind: "matchmaker", name: "Maya" },
    });
    // The seed's own events are attributed to the owner too.
    expect(all.page.map((event) => event.action)).toContain(
      "candidate.created",
    );

    const membership = await w.asMaya.query(
      api.audit.queries.candidateHistory,
      {
        ...args,
        filter: "membership",
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    expect(membership.page.map((event) => event.action)).toEqual([
      "invite.created",
    ]);
  });

  test("is refused to anyone but the matchmaker", async () => {
    const w = await world();
    await expect(
      w.asRival.query(api.audit.queries.candidateHistory, {
        matchmakerId: w.rivalMatchmakerId,
        candidateId: w.candidateId,
        filter: "all",
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Not found.");
  });
});
