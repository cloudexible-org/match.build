import { describe, expect, test } from "vitest";
import { safeNextPath, signInPath } from "./redirects";

describe("safeNextPath", () => {
  test.each([
    [null, "/"],
    ["", "/"],
    ["/audit", "/audit"],
    ["/audit?action=note.created", "/audit?action=note.created"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["audit", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("signInPath", () => {
  test("omits next for home", () => {
    expect(signInPath("/")).toBe("/sign-in");
  });

  test("encodes the path to return to", () => {
    expect(signInPath("/sign-in-codes?x=1")).toBe(
      "/sign-in?next=%2Fsign-in-codes%3Fx%3D1",
    );
  });
});
