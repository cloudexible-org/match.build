import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, groupByDay } from "./history-days";

const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

describe("dayKey", () => {
  it("is the local calendar day, not the hour", () => {
    expect(dayKey(at(2026, 9, 21, 0))).toBe(dayKey(at(2026, 9, 21, 23)));
    expect(dayKey(at(2026, 9, 21))).not.toBe(dayKey(at(2026, 9, 22)));
  });
});

describe("dayLabel", () => {
  const now = at(2026, 9, 21, 17);

  it("names today and yesterday rather than dating them", () => {
    expect(dayLabel(at(2026, 9, 21, 9), now)).toBe("Today");
    expect(dayLabel(at(2026, 9, 20, 23), now)).toBe("Yesterday");
  });

  it("dates anything older", () => {
    const label = dayLabel(at(2026, 9, 19), now);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
    expect(label).toContain("2026");
  });

  it("reads yesterday across a month boundary", () => {
    expect(dayLabel(at(2026, 8, 31, 22), at(2026, 9, 1, 9))).toBe("Yesterday");
  });
});

describe("groupByDay", () => {
  const now = at(2026, 9, 21, 17);

  it("keeps the order given and gathers each run of one day", () => {
    const groups = groupByDay(
      [
        { _creationTime: at(2026, 9, 21, 17) },
        { _creationTime: at(2026, 9, 21, 9) },
        { _creationTime: at(2026, 9, 20, 11) },
        { _creationTime: at(2026, 9, 18, 11) },
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      expect.stringContaining("2026"),
    ]);
    expect(groups[0]?.events).toHaveLength(2);
    expect(groups[1]?.events).toHaveLength(1);
    expect(groups[2]?.events).toHaveLength(1);
  });

  it("does not teleport an out-of-order event into an earlier heading", () => {
    const groups = groupByDay(
      [
        { _creationTime: at(2026, 9, 21, 17) },
        { _creationTime: at(2026, 9, 20, 11) },
        { _creationTime: at(2026, 9, 21, 3) },
      ],
      now,
    );
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Today",
    ]);
  });

  it("has nothing to group when there is nothing", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
