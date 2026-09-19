import { describe, expect, test } from "vitest";
import {
  candidateDisplayName,
  inviteUrl,
  membershipMarker,
} from "./candidate-labels";

describe("candidate labels", () => {
  test("a candidate is named by their name, else their email", () => {
    expect(
      candidateDisplayName({ name: "Jane", email: "jane@example.test" }),
    ).toBe("Jane");
    expect(candidateDisplayName({ email: "jane@example.test" })).toBe(
      "jane@example.test",
    );
  });

  test("only non-members get a marker", () => {
    expect(membershipMarker("invited")).toBe("Invited");
    expect(membershipMarker("account_deleted")).toBe("Account deleted");
    expect(membershipMarker("joined")).toBeNull();
  });

  test("invite URLs sit under the app's base path", () => {
    expect(inviteUrl("tok", "https://www.example.test", "/app/")).toBe(
      "https://www.example.test/app/invite/tok",
    );
    expect(inviteUrl("tok", "http://127.0.0.1:5173", "/app")).toBe(
      "http://127.0.0.1:5173/app/invite/tok",
    );
  });
});
