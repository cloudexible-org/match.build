import { describe, expect, it } from "vitest";
import {
  type Carouselled,
  currentIndex,
  idAfterDismiss,
  stepId,
} from "./carousel";

const at = (id: string): Carouselled => ({ id });

describe("currentIndex", () => {
  const items = [at("a"), at("b"), at("c")];

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
  const items = [at("a"), at("b"), at("c")];

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
  const items = [at("a"), at("b"), at("c")];

  it("moves to the next one along", () => {
    expect(idAfterDismiss(items, 0)).toBe("b");
    expect(idAfterDismiss(items, 1)).toBe("c");
  });

  it("steps back when the last one is answered", () => {
    expect(idAfterDismiss(items, 2)).toBe("b");
  });

  it("holds nothing once the row is empty", () => {
    expect(idAfterDismiss([at("only")], 0)).toBeNull();
  });
});
