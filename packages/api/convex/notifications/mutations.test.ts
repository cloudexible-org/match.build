/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { messageRecipient } from "./helpers";
import { EMAIL_DELAY_MS, PUSH_DELAY_MS, PUSH_INTERVAL_MS } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

/**
 * Notifications end to end (prd/phase-1.md §8.1). Every test drives the real
 * path — a message is sent, a job is scheduled, time passes, the job fires —
 * because the whole feature is about what is true *later*, and only the
 * scheduler can show that.
 *
 * No VAPID keys are set, so push never leaves the deployment; the rows still
 * record exactly what would have been sent, which is what these assert on.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("SITE_URL", "https://app.example.test/app");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function newTest() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof newTest>;

/** A matchmaker with one joined candidate, and a thread ready to write to. */
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
      email: "jane@example.test",
      socialHandles: [],
      membership: "joined",
      membershipChangedAt: 1,
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

/** Every notification row, newest state, for assertions. */
async function rows(t: T) {
  return await t.run((ctx) => ctx.db.query("notifications").collect());
}

async function outbox(t: T, to: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("emailOutbox")
      .withIndex("by_to", (q) => q.eq("to", to))
      .collect(),
  );
}

/** Runs every job due within `ms`, and the sends they schedule. */
async function advance(t: T, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
  // A delivery schedules its own send, which is due immediately.
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
}

/** The matchmaker writes to the candidate. */
const write = (w: World, body: string) =>
  w.asOwner.mutation(api.messages.mutations.send, {
    matchmakerId: w.matchmakerId,
    candidateId: w.candidateId,
    body,
  });

describe("scheduling", () => {
  test("a message schedules one push and one email for the other side", async () => {
    const w = await world();
    await write(w, "Hello Jane");

    const scheduled = await rows(w.t);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.every((row) => row.userId === w.member)).toBe(true);
    expect(scheduled.every((row) => row.status === "scheduled")).toBe(true);
    expect(scheduled.every((row) => row.triggerSeq === 1)).toBe(true);
    const byChannel = Object.fromEntries(
      scheduled.map((row) => [row.channel, row.scheduledFor]),
    );
    expect(byChannel.push).toBe(Date.now() + PUSH_DELAY_MS);
    expect(byChannel.email).toBe(Date.now() + EMAIL_DELAY_MS);
  });

  test("the sender is never notified of their own message", async () => {
    const w = await world();
    await write(w, "Hello Jane");
    expect((await rows(w.t)).some((row) => row.userId === w.owner)).toBe(false);
  });

  test("decides who to tell from the message, not from who sent it", async () => {
    const w = await world();
    const candidate = await w.t.run((ctx) =>
      ctx.db.get("candidates", w.candidateId),
    );
    if (candidate === null) throw new Error("candidate vanished");
    const recipient = (args: {
      author: "matchmaker" | "candidate" | "system";
      visibility: "everyone" | "matchmaker";
      membership?: "joined" | "left";
      linked?: boolean;
    }) =>
      w.t.run((ctx) =>
        messageRecipient(ctx, {
          candidate: {
            ...candidate,
            membership: args.membership ?? "joined",
            userId: args.linked === false ? undefined : candidate.userId,
          },
          author: args.author,
          visibility: args.visibility,
        }),
      );

    // The other side, either way round.
    expect(
      await recipient({ author: "matchmaker", visibility: "everyone" }),
    ).toEqual({ userId: w.member, side: "candidate" });
    expect(
      await recipient({ author: "candidate", visibility: "everyone" }),
    ).toEqual({ userId: w.owner, side: "matchmaker" });

    // A private message is the matchmaker's own note to self: nobody.
    expect(
      await recipient({ author: "matchmaker", visibility: "matchmaker" }),
    ).toBeNull();
    // A system message has no other party.
    expect(
      await recipient({ author: "system", visibility: "everyone" }),
    ).toBeNull();
    // Nobody is notified for a candidate who isn't a member, or who has no
    // account to notify yet.
    expect(
      await recipient({
        author: "matchmaker",
        visibility: "everyone",
        membership: "left",
      }),
    ).toBeNull();
    expect(
      await recipient({
        author: "matchmaker",
        visibility: "everyone",
        linked: false,
      }),
    ).toBeNull();
  });

  test("a candidate who isn't a member can't be written to at all", async () => {
    const w = await world();
    await w.t.run((ctx) =>
      ctx.db.patch("candidates", w.candidateId, { membership: "left" }),
    );
    await expect(write(w, "Still there?")).rejects.toThrow();
    expect(await rows(w.t)).toHaveLength(0);
  });

  test("later messages ride the pending job instead of adding more", async () => {
    const w = await world();
    await write(w, "One");
    await write(w, "Two");
    await write(w, "Three");

    const scheduled = await rows(w.t);
    expect(scheduled).toHaveLength(2);
    // Each job now asks about the newest message, not the first.
    expect(scheduled.every((row) => row.triggerSeq === 3)).toBe(true);
  });
});

describe("when the job fires", () => {
  test("sends the email when it still hasn't been read", async () => {
    const w = await world();
    await write(w, "Hello Jane");
    await advance(w.t, EMAIL_DELAY_MS);

    const sent = await outbox(w.t, "jane@example.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("new_message");
    expect(sent[0].subject).toBe("You have a new message from Maya's Book");
    // Never the message itself (prd §8, §9.3).
    expect(sent[0].text).not.toContain("Hello Jane");
    expect(sent[0].text).toContain(
      "https://app.example.test/app/c#maya.matches",
    );
    expect(
      (await rows(w.t)).filter((row) => row.channel === "email")[0].status,
    ).toBe("sent");
  });

  test("sends nothing once the recipient has read it", async () => {
    const w = await world();
    await write(w, "Hello Jane");
    // She opens the chat before either job is due.
    await w.asMember.mutation(api.messages.mutations.markReadAsCandidate, {
      candidateId: w.candidateId,
      seq: 1,
    });
    await advance(w.t, EMAIL_DELAY_MS);

    expect(await outbox(w.t, "jane@example.test")).toHaveLength(0);
    expect((await rows(w.t)).map((row) => row.status)).toEqual([
      "skipped_seen",
      "skipped_seen",
    ]);
  });

  test("still sends when they read an earlier message but not this one", async () => {
    const w = await world();
    await write(w, "One");
    await w.asMember.mutation(api.messages.mutations.markReadAsCandidate, {
      candidateId: w.candidateId,
      seq: 1,
    });
    // A second message arrives after she caught up.
    await write(w, "Two");
    await advance(w.t, EMAIL_DELAY_MS);

    expect(await outbox(w.t, "jane@example.test")).toHaveLength(1);
  });

  test("sends nothing on a channel the recipient turned off", async () => {
    const w = await world();
    await w.asMember.mutation(api.notifications.mutations.setChannels, {
      emailEnabled: false,
      pushEnabled: false,
    });
    await write(w, "Hello Jane");
    await advance(w.t, EMAIL_DELAY_MS);

    expect(await outbox(w.t, "jane@example.test")).toHaveLength(0);
    expect(
      (await rows(w.t)).every((row) => row.status === "skipped_disabled"),
    ).toBe(true);
  });

  test("sends nothing to a candidate who left before the job fired", async () => {
    const w = await world();
    await write(w, "Hello Jane");
    await w.asMember.mutation(api.candidates.mutations.leave, {
      candidateId: w.candidateId,
    });
    await advance(w.t, EMAIL_DELAY_MS);

    expect(await outbox(w.t, "jane@example.test")).toHaveLength(0);
    expect(
      (await rows(w.t))
        .filter((row) => row.userId === w.member)
        .every((row) => row.status === "skipped_disabled"),
    ).toBe(true);
  });
});

describe("throttling", () => {
  test("no second email until the first one has been read", async () => {
    const w = await world();
    await write(w, "One");
    await advance(w.t, EMAIL_DELAY_MS);
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(1);

    // Another message, and another wait: still nothing, because she hasn't
    // read the one we already told her about.
    await write(w, "Two");
    await advance(w.t, EMAIL_DELAY_MS);
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(1);

    // Once she has read it, a later message can email again.
    await w.asMember.mutation(api.messages.mutations.markReadAsCandidate, {
      candidateId: w.candidateId,
      seq: 2,
    });
    await write(w, "Three");
    await advance(w.t, EMAIL_DELAY_MS);
    expect(await outbox(w.t, "jane@example.test")).toHaveLength(2);
  });

  test("a push inside the one-a-minute window waits for the end of it", async () => {
    const w = await world();
    await write(w, "One");
    await advance(w.t, PUSH_DELAY_MS);
    const firstSentAt = (await rows(w.t)).find(
      (row) => row.channel === "push",
    )?.sentAt;
    expect(firstSentAt).toBeDefined();

    await write(w, "Two");
    const push = (await rows(w.t)).find((row) => row.channel === "push");
    expect(push?.status).toBe("scheduled");
    // Not 30s from now — the end of the window that opened with the last push.
    expect(push?.scheduledFor).toBe((firstSentAt ?? 0) + PUSH_INTERVAL_MS);
  });
});

describe("the candidate's messages", () => {
  test("notify the matchmaker, with the candidate's name and their conversation", async () => {
    const w = await world();
    await w.asMember.mutation(api.messages.mutations.sendAsCandidate, {
      candidateId: w.candidateId,
      body: "Thanks!",
    });
    const scheduled = await rows(w.t);
    expect(scheduled.every((row) => row.userId === w.owner)).toBe(true);

    await advance(w.t, EMAIL_DELAY_MS);
    const sent = await outbox(w.t, "maya@example.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("You have a new message from Jane Member");
    expect(sent[0].text).toContain(
      `https://app.example.test/app/mm/maya.matches/c/${w.candidateId}`,
    );
  });
});

describe("the settings query", () => {
  test("answers the defaults, then what was saved, in the shape it promises", async () => {
    const w = await world();
    // Both channels on for an account that has never touched them.
    expect(
      await w.asMember.query(api.notifications.queries.settings, {}),
    ).toEqual({
      emailEnabled: true,
      pushEnabled: true,
      email: "jane@example.test",
      vapidPublicKey: null,
    });

    await w.asMember.mutation(api.notifications.mutations.setChannels, {
      emailEnabled: false,
      pushEnabled: true,
    });
    // Exactly these fields: a stored row's `_id` and `userId` must not ride
    // along, which is both a validator failure and a leak.
    expect(
      await w.asMember.query(api.notifications.queries.settings, {}),
    ).toEqual({
      emailEnabled: false,
      pushEnabled: true,
      email: "jane@example.test",
      vapidPublicKey: null,
    });
  });

  test("is null when signed out", async () => {
    const w = await world();
    expect(await w.t.query(api.notifications.queries.settings, {})).toBeNull();
  });
});

describe("membership notices", () => {
  test("tell the matchmaker when a candidate leaves, straight away", async () => {
    const w = await world();
    await w.asMember.mutation(api.candidates.mutations.leave, {
      candidateId: w.candidateId,
      reason: "Met someone!",
    });
    await advance(w.t, 1);

    const sent = await outbox(w.t, "maya@example.test");
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe("membership_changed");
    expect(sent[0].subject).toBe("Jane Member left");
    expect(sent[0].text).toContain("still there");
    // Not coalesced through the notifications table: it happens once.
    expect(await rows(w.t)).toHaveLength(0);
  });

  test("tell the matchmaker when an invitation is accepted", async () => {
    const w = await world();
    vi.stubEnv("INVITE_LINK_SECRET", "test-invite-secret");
    const outsiderId = await w.t.run((ctx) =>
      ctx.db.insert("users", {
        email: "otto@example.test",
        name: "Otto Outsider",
        emailVerificationTime: 1,
      }),
    );
    const invitedId = await w.asOwner
      .mutation(api.candidates.mutations.onboard, {
        matchmakerId: w.matchmakerId,
        email: "otto@example.test",
        name: "Otto Outsider",
        socialHandles: [],
      })
      .then((result) => result.candidateId as Id<"candidates">);
    await w.t
      .withIdentity({ subject: `${outsiderId}|s` })
      .mutation(api.invites.mutations.accept, { candidateId: invitedId });
    await advance(w.t, 1);

    const sent = await outbox(w.t, "maya@example.test");
    expect(
      sent.some(
        (email) => email.subject === "Otto Outsider accepted your invitation",
      ),
    ).toBe(true);
  });

  test("say nothing to a matchmaker who turned email off", async () => {
    const w = await world();
    await w.asOwner.mutation(api.notifications.mutations.setChannels, {
      emailEnabled: false,
      pushEnabled: false,
    });
    await w.asMember.mutation(api.candidates.mutations.leave, {
      candidateId: w.candidateId,
    });
    await advance(w.t, 1);
    expect(await outbox(w.t, "maya@example.test")).toHaveLength(0);
  });
});
