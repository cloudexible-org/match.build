import { describe, expect, test } from "vitest";
import { safeNextPath, signInPath } from "./redirects";

describe("safeNextPath", () => {
  test.each([
    [null, "/"],
    ["", "/"],
    ["/mm/jane.matches", "/mm/jane.matches"],
    ["/c/jane.matches?tab=1", "/c/jane.matches?tab=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["mm/relative", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("signInPath", () => {
  test("omits next for home", () => {
    expect(signInPath("/")).toBe("/sign-in");
  });

  test("encodes the path to return to", () => {
    expect(signInPath("/invite/abc?x=1")).toBe(
      "/sign-in?next=%2Finvite%2Fabc%3Fx%3D1",
    );
  });
});
