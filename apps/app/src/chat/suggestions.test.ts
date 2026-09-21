import { describe, expect, it } from "vitest";
import {
  rowsByKind,
  type Suggestion,
  type SuggestionKind,
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
