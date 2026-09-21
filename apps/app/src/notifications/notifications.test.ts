import { describe, expect, test } from "vitest";
import {
  bellLabel,
  initials,
  type Notification,
  timeAgo,
  unreadBadge,
  unreadCount,
  unreadIds,
} from "./notifications";

const at = (read: boolean, id: string): Notification => ({
  id,
  kind: "message",
  title: "Jane Doe",
  body: "…",
  at: 0,
  read,
});

describe("unread", () => {
  test("counts only what hasn't been read", () => {
    expect(unreadCount([])).toBe(0);
    expect(unreadCount([at(true, "a"), at(true, "b")])).toBe(0);
    expect(unreadCount([at(false, "a"), at(true, "b"), at(false, "c")])).toBe(
      2,
    );
  });

  test("the snapshot is the ids unread at that moment", () => {
    expect([...unreadIds([])]).toEqual([]);
    expect([
      ...unreadIds([at(false, "a"), at(true, "b"), at(false, "c")]),
    ]).toEqual(["a", "c"]);
    // Taken once, so marking everything read afterwards can't empty it —
    // that is the whole point of holding it while the panel is open.
    const snapshot = unreadIds([at(false, "a")]);
    expect(unreadIds([at(true, "a")]).has("a")).toBe(false);
    expect(snapshot.has("a")).toBe(true);
  });

  test("the badge stops counting past nine", () => {
    expect(unreadBadge(1)).toBe("1");
    expect(unreadBadge(9)).toBe("9");
    expect(unreadBadge(10)).toBe("9+");
    expect(unreadBadge(247)).toBe("9+");
  });

  test("the bell says how many, or just what it is", () => {
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(1)).toBe("Notifications, 1 unread");
    // The label counts even where the badge has given up.
    expect(bellLabel(12)).toBe("Notifications, 12 unread");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-03-12T12:00:00Z").getTime();
  const ago = (ms: number) => timeAgo(now - ms, now);

  test("under a minute is 'now'", () => {
    expect(ago(0)).toBe("now");
    expect(ago(59_000)).toBe("now");
  });

  test("minutes, hours and days, rounded down", () => {
    expect(ago(60_000)).toBe("1m");
    expect(ago(59 * 60_000)).toBe("59m");
    expect(ago(90 * 60_000)).toBe("1h");
    expect(ago(23.9 * 3_600_000)).toBe("23h");
    expect(ago(25 * 3_600_000)).toBe("1d");
    expect(ago(6.5 * 86_400_000)).toBe("6d");
  });

  test("a week back it becomes a date", () => {
    // Not asserting the exact string: the format follows the reader's locale.
    expect(ago(8 * 86_400_000)).toMatch(/\d/);
    expect(ago(8 * 86_400_000)).not.toMatch(/^\d+[mhd]$/);
  });

  test("a date in another year says which", () => {
    const old = ago(400 * 86_400_000);
    expect(old).toContain("2025");
  });
});

describe("initials", () => {
  test("first and last, at most two letters", () => {
    expect(initials("Jane Doe")).toBe("JD");
    expect(initials("Jane van Dijk")).toBe("JD");
    expect(initials("Prince")).toBe("P");
    expect(initials("  ada   lovelace ")).toBe("AL");
  });

  test("survives a name that isn't one", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
