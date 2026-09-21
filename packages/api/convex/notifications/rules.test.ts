import { describe, expect, test } from "vitest";
import {
  EMAIL_DELAY_MS,
  membershipEmail,
  newMessageEmail,
  newMessagePush,
  nextPushAt,
  PUSH_DELAY_MS,
  PUSH_INTERVAL_MS,
  skipScheduling,
} from "./rules";

describe("when a push may go out", () => {
  test("after the usual delay when none has been sent", () => {
    expect(nextPushAt(1_000, undefined)).toBe(1_000 + PUSH_DELAY_MS);
  });

  test("at the end of the one-a-minute window when one just went", () => {
    const now = 1_000_000;
    // Sent 10s ago: the window ends later than the usual delay, so it waits.
    const justSent = now - 10_000;
    expect(nextPushAt(now, justSent)).toBe(justSent + PUSH_INTERVAL_MS);
    // Long ago: the window is irrelevant and the usual delay applies.
    expect(nextPushAt(now, now - PUSH_INTERVAL_MS * 5)).toBe(
      now + PUSH_DELAY_MS,
    );
  });

  test("never sooner than the usual delay", () => {
    const now = 1_000_000;
    expect(nextPushAt(now, now)).toBeGreaterThanOrEqual(now + PUSH_DELAY_MS);
  });
});

describe("whether to schedule at all", () => {
  const readSeq = 3;

  test("schedules when nothing has been scheduled before", () => {
    for (const channel of ["push", "email"] as const) {
      expect(skipScheduling({ channel, readSeq })).toBeNull();
    }
  });

  test("rides a pending job rather than adding a second", () => {
    const existing = { status: "scheduled", triggerSeq: 4 };
    expect(skipScheduling({ channel: "push", existing, readSeq })).toBe(
      "pending",
    );
    expect(skipScheduling({ channel: "email", existing, readSeq })).toBe(
      "pending",
    );
  });

  test("sends no second email until the first one has been read", () => {
    // Emailed about message 5; they have only read up to 3.
    const unread = { status: "sent", triggerSeq: 5 };
    expect(
      skipScheduling({ channel: "email", existing: unread, readSeq }),
    ).toBe("unread_email");
    // Push is capped by time instead, not by whether it was read.
    expect(
      skipScheduling({ channel: "push", existing: unread, readSeq }),
    ).toBeNull();
  });

  test("emails again once the last one has been caught up with", () => {
    const caughtUp = { status: "sent", triggerSeq: 3 };
    expect(
      skipScheduling({ channel: "email", existing: caughtUp, readSeq }),
    ).toBeNull();
  });

  test("a skipped or failed attempt never blocks the next one", () => {
    for (const status of ["skipped_seen", "skipped_disabled", "failed"]) {
      expect(
        skipScheduling({
          channel: "email",
          existing: { status, triggerSeq: 99 },
          readSeq,
        }),
      ).toBeNull();
    }
  });
});

describe("what a notification says", () => {
  test("email names who wrote and never what they wrote", () => {
    const message = newMessageEmail({
      fromName: "Maya Maker",
      link: "https://example.test/app/c#maya",
    });
    expect(message.subject).toBe("You have a new message from Maya Maker");
    for (const part of [message.text, message.html]) {
      expect(part).toContain("Maya Maker");
      expect(part).toContain("https://example.test/app/c#maya");
      // The way out has to be in the email itself (prd §8.1).
      expect(part).toContain("turn these emails off");
    }
  });

  test("push says the same, in the shape the service worker reads", () => {
    const payload = newMessagePush({
      fromName: "Maya Maker",
      url: "https://example.test/app/c#maya",
    });
    expect(payload).toEqual({
      title: "Maya Maker",
      body: "Sent you a message",
      url: "https://example.test/app/c#maya",
    });
  });

  test("a membership email says what changed and that records are kept", () => {
    const left = membershipEmail({
      candidateName: "Lea",
      event: "left",
      link: "https://example.test/app/mm/maya/c/1",
    });
    expect(left.subject).toBe("Lea left");
    expect(left.text).toContain("still there");
    expect(
      membershipEmail({
        candidateName: "Lea",
        event: "accepted",
        link: "x",
      }).subject,
    ).toBe("Lea accepted your invitation");
  });

  test("names with HTML in them can't break out of the markup", () => {
    const message = newMessageEmail({
      fromName: '<script>alert("x")</script>',
      link: "https://example.test/app",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});

describe("the delays themselves", () => {
  test("match the spec: push soon, email much later", () => {
    expect(PUSH_DELAY_MS).toBe(30 * 1000);
    expect(EMAIL_DELAY_MS).toBe(5 * 60 * 1000);
    expect(PUSH_DELAY_MS).toBeLessThan(EMAIL_DELAY_MS);
  });
});
