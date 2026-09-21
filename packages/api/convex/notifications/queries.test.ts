/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { MEMBERSHIP_WINDOW_MS } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

/**
 * The in-app notifications panel (`queries.feed`).
 *
 * Every test drives the real path — a message is sent, a conversation is
 * read, the panel is opened — because the list is derived from that state and
 * asserting on a hand-written row would only prove the fixture.
 */

function newTest() {
  return convexTest(schema, modules);
}

/**
 * Maya, a matchmaker, with Jane as a joined candidate and a conversation
 * between them. Jane also has her own account, so both sides can be read.
 */
async function world() {
  const t = newTest();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      email: "maya@example.test",
      name: "Maya Maker",
      emailVerificationTime: 1,
    });
    const member = await ctx.db.insert("users", {
      email: "jane@example.test",
      name: "Jane Member",
      emailVerificationTime: 1,
    });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "maya.matches",
      usernameKey: "mayamatches",
      displayName: "Maya's Book",
    });
    const candidateId = await ctx.db.insert("candidates", {
      matchmakerId,
      userId: member,
      name: "Jane Doe",
      email: "jane@example.test",
      socialHandles: [],
      membership: "joined",
      // Joined long ago, so a test about messages sees only messages. The
      // tests that are about joining move it forward themselves.
      membershipChangedAt: Date.now() - MEMBERSHIP_WINDOW_MS - 1,
      status: "active",
    });
    const conversationId = await ctx.db.insert("conversations", {
      matchmakerId,
      candidateId,
      lastSeq: 0,
      lastPublicSeq: 0,
      lastMessageAt: 1,
      matchmakerLastReadSeq: 0,
      candidateLastReadSeq: 0,
    });
    return { owner, member, matchmakerId, candidateId, conversationId };
  });
  return {
    t,
    ...ids,
    asOwner: t.withIdentity({ subject: `${ids.owner}|s` }),
    asMember: t.withIdentity({ subject: `${ids.member}|s` }),
  };
}

type World = Awaited<ReturnType<typeof world>>;

const feedFor = (as: World["asOwner"]) =>
  as.query(api.notifications.queries.feed, {});

const writeAsMatchmaker = (w: World, body: string) =>
  w.asOwner.mutation(api.messages.mutations.send, {
    matchmakerId: w.matchmakerId,
    candidateId: w.candidateId,
    body,
  });

const writeAsCandidate = (w: World, body: string) =>
  w.asMember.mutation(api.messages.mutations.sendAsCandidate, {
    candidateId: w.candidateId,
    body,
  });

describe("messages", () => {
  test("a candidate's message reaches their matchmaker's panel", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");

    const feed = await feedFor(w.asOwner);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "message",
      // The matchmaker's own label for her, not the account's name.
      title: "Jane Doe",
      body: "Sent you a message",
      read: false,
      href: `/mm/maya.matches/c/${w.candidateId}`,
    });
  });

  test("several messages are one item that counts them", async () => {
    const w = await world();
    await writeAsCandidate(w, "One");
    await writeAsCandidate(w, "Two");
    await writeAsCandidate(w, "Three");

    const feed = await feedFor(w.asOwner);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.body).toBe("3 new messages");
  });

  test("the panel never carries the message itself", async () => {
    const w = await world();
    await writeAsCandidate(w, "I have been seeing a therapist about it");

    const feed = await feedFor(w.asOwner);
    expect(JSON.stringify(feed)).not.toContain("therapist");
  });

  test("nobody is told about their own message", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    expect(await feedFor(w.asMember)).toEqual([]);
  });

  test("reading the conversation takes the item away", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    expect(await feedFor(w.asOwner)).toHaveLength(1);

    await w.asOwner.mutation(api.messages.mutations.markRead, {
      matchmakerId: w.matchmakerId,
      candidateId: w.candidateId,
      seq: 1,
    });
    expect(await feedFor(w.asOwner)).toEqual([]);
  });

  test("a candidate is told about their matchmaker's reply", async () => {
    const w = await world();
    await writeAsMatchmaker(w, "Hello Jane");

    const feed = await feedFor(w.asMember);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "message",
      title: "Maya's Book",
      href: "/c#maya.matches",
    });
  });

  test("a private note is not a message the candidate is waiting on", async () => {
    const w = await world();
    // What onboarding's imported history leaves behind: a message the
    // matchmaker can see, and a public sequence that hasn't moved.
    await w.t.run(async (ctx) => {
      await ctx.db.insert("messages", {
        matchmakerId: w.matchmakerId,
        conversationId: w.conversationId,
        seq: 1,
        author: "matchmaker",
        visibility: "matchmaker",
        source: "imported",
        body: "She mentioned a second date",
        sentAt: Date.now(),
      });
      await ctx.db.patch("conversations", w.conversationId, {
        lastSeq: 1,
        matchmakerLastReadSeq: 1,
        lastMessageAt: Date.now(),
      });
    });
    expect(await feedFor(w.asMember)).toEqual([]);
  });

  test("a candidate who left is told nothing", async () => {
    const w = await world();
    await writeAsMatchmaker(w, "Hello Jane");
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidateId, { membership: "left" });
    });
    expect(await feedFor(w.asMember)).toEqual([]);
  });
});

describe("memberships and invitations", () => {
  test("a matchmaker is told their invitation was accepted", async () => {
    const w = await world();
    await w.t.run(async (ctx) => {
      await ctx.db.patch("candidates", w.candidateId, {
        membershipChangedAt: Date.now(),
      });
    });

    const feed = await feedFor(w.asOwner);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "invite",
      title: "Jane Doe",
      body: "Accepted your invitation",
    });
  });

  test("a membership change stops being news after a month", async () => {
    // The world's candidate joined a month and a millisecond ago.
    const w = await world();
    expect(await feedFor(w.asOwner)).toEqual([]);
  });

  test("an open invitation waits in the invited person's panel", async () => {
    const w = await world();
    const candidateId = await w.t.run(async (ctx) =>
      ctx.db.insert("candidates", {
        matchmakerId: w.matchmakerId,
        email: "jane@example.test",
        socialHandles: [],
        membership: "invited",
        membershipChangedAt: Date.now(),
        status: "active",
      }),
    );

    const feed = await feedFor(w.asMember);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "invite",
      title: "Maya's Book",
      body: "Invited you to connect",
      href: `/invitations/${candidateId}`,
    });
    // The matchmaker isn't told about an invitation they sent themselves.
    const owner = await feedFor(w.asOwner);
    expect(
      owner.every(
        (item) => item.kind !== "invite" || item.title !== "Maya's Book",
      ),
    ).toBe(true);
  });
});

describe("what counts as read", () => {
  test("opening the panel marks what is there, and nothing later", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    expect((await feedFor(w.asOwner)).every((item) => !item.read)).toBe(true);

    await w.asOwner.mutation(api.notifications.mutations.markFeedSeen, {});
    expect((await feedFor(w.asOwner)).every((item) => item.read)).toBe(true);

    // Something that happens afterwards is new again.
    await w.t.run(async (ctx) => {
      await ctx.db.patch("conversations", w.conversationId, {
        lastMessageAt: Date.now() + 1_000,
      });
    });
    const feed = await feedFor(w.asOwner);
    expect(feed.find((item) => item.kind === "message")?.read).toBe(false);
  });

  test("opening the panel leaves the conversation unread", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    await w.asOwner.mutation(api.notifications.mutations.markFeedSeen, {});

    // Still waiting in the workspace, and still in the panel — seen, not read.
    const [candidate] = await w.asOwner.query(api.candidates.queries.list, {
      matchmakerId: w.matchmakerId,
      status: "active",
    });
    expect(candidate?.unread).toBe(1);
    expect(await feedFor(w.asOwner)).toHaveLength(1);
  });

  test("it belongs to the account that opened it", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    await writeAsMatchmaker(w, "Hello Jane");
    await w.asOwner.mutation(api.notifications.mutations.markFeedSeen, {});

    expect((await feedFor(w.asOwner)).every((item) => item.read)).toBe(true);
    expect((await feedFor(w.asMember)).every((item) => !item.read)).toBe(true);
  });

  test("signed out it is empty rather than an error", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    expect(await w.t.query(api.notifications.queries.feed, {})).toEqual([]);
    await expect(
      w.t.mutation(api.notifications.mutations.markFeedSeen, {}),
    ).rejects.toThrow();
  });

  test("one account never sees another's", async () => {
    const w = await world();
    await writeAsCandidate(w, "Hello Maya");
    const stranger = await w.t.run((ctx) =>
      ctx.db.insert("users", {
        email: "nobody@example.test",
        emailVerificationTime: 1,
      }),
    );
    const asStranger = w.t.withIdentity({ subject: `${stranger}|s` });
    expect(await feedFor(asStranger)).toEqual([]);
  });
});
