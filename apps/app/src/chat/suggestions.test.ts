import { describe, expect, it } from "vitest";
import {
  currentIndex,
  idAfterDismiss,
  rowsByKind,
  type Suggestion,
  type SuggestionKind,
  stepId,
} from "./suggestions";

const at = (
  id: string,
  kind: SuggestionKind,
  suggestedAt: number,
): Suggestion => ({ id, kind, suggestedAt });

describe("rowsByKind", () => {
  it("gives one row per kind, in stack order", () => {
    const rows = rowsByKind([
      at("r", "reply", 1),
      at("c", "candidateProfile", 1),
      at("m", "matchmakerProfile", 1),
    ]);
    expect(rows.map((row) => row.kind)).toEqual([
      "matchmakerProfile",
      "candidateProfile",
      "reply",
    ]);
  });

  it("drops a kind with nothing to say", () => {
    expect(rowsByKind([at("r", "reply", 1)]).map((row) => row.kind)).toEqual([
      "reply",
    ]);
    expect(rowsByKind([])).toEqual([]);
  });

  it("puts the newest of a row first", () => {
    const [row] = rowsByKind([
      at("old", "candidateProfile", 100),
      at("new", "candidateProfile", 300),
      at("mid", "candidateProfile", 200),
    ]);
    expect(row?.items.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("orders two proposals from the same millisecond by id", () => {
    const rows = rowsByKind([
      at("b", "candidateProfile", 100),
      at("a", "candidateProfile", 100),
    ]);
    expect(rows[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not reorder what it was given", () => {
    const given = [at("a", "reply", 1), at("b", "reply", 2)];
    rowsByKind(given);
    expect(given.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("currentIndex", () => {
  const items = [at("a", "reply", 3), at("b", "reply", 2), at("c", "reply", 1)];

  it("shows the newest until something is chosen", () => {
    expect(currentIndex(items, null)).toBe(0);
  });

  it("shows what was chosen", () => {
    expect(currentIndex(items, "c")).toBe(2);
  });

  it("falls back to the newest when the chosen one has gone", () => {
    expect(currentIndex(items, "gone")).toBe(0);
  });

  it("is 0 on an empty row, which renders nothing", () => {
    expect(currentIndex([], "a")).toBe(0);
  });
});

describe("stepId", () => {
  const items = [at("a", "reply", 3), at("b", "reply", 2), at("c", "reply", 1)];

  it("walks the row in both directions", () => {
    expect(stepId(items, 1, -1)).toBe("a");
    expect(stepId(items, 1, 1)).toBe("c");
  });

  it("stops at either end rather than wrapping", () => {
    expect(stepId(items, 0, -1)).toBeNull();
    expect(stepId(items, 2, 1)).toBeNull();
  });
});

describe("idAfterDismiss", () => {
  const items = [at("a", "reply", 3), at("b", "reply", 2), at("c", "reply", 1)];

  it("moves to the next one along", () => {
    expect(idAfterDismiss(items, 0)).toBe("b");
    expect(idAfterDismiss(items, 1)).toBe("c");
  });

  it("steps back when the last one is answered", () => {
    expect(idAfterDismiss(items, 2)).toBe("b");
  });

  it("holds nothing once the row is empty", () => {
    expect(idAfterDismiss([at("only", "reply", 1)], 0)).toBeNull();
  });
});
