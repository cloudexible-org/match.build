import { describe, expect, test } from "vitest";
import {
  auditFiltersError,
  emailPrefixRange,
  isAdminEmail,
  parseAdminEmails,
} from "./rules";

describe("parseAdminEmails", () => {
  test("splits, trims, lowercases and drops blanks", () => {
    expect(parseAdminEmails(" Aileen@Example.com, ,ops@example.com ,")).toEqual(
      ["aileen@example.com", "ops@example.com"],
    );
  });

  test("unset or blank means nobody", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  test("matches whatever the case", () => {
    expect(isAdminEmail("AILEEN@example.com", "aileen@example.com")).toBe(true);
  });

  test("refuses unlisted, missing and unconfigured", () => {
    expect(isAdminEmail("eve@example.com", "aileen@example.com")).toBe(false);
    expect(isAdminEmail(undefined, "aileen@example.com")).toBe(false);
    expect(isAdminEmail("aileen@example.com", undefined)).toBe(false);
  });

  test("an entry must match the whole address", () => {
    expect(isAdminEmail("en@example.com", "aileen@example.com")).toBe(false);
  });
});

test("emailPrefixRange spans every address with the prefix", () => {
  const { start, end } = emailPrefixRange(" Jane");
  expect(start).toBe("jane");
  for (const email of ["jane", "jane@example.com", "jane.smith@x.test"]) {
    expect(email >= start && email < end).toBe(true);
  }
  expect("janf@example.com" < end).toBe(false);
});

test("auditFiltersError refuses a subject together with an account", () => {
  expect(auditFiltersError({})).toBeNull();
  expect(auditFiltersError({ matchmakerId: "m", action: "x" })).toBeNull();
  expect(auditFiltersError({ actorUserId: "u", action: "x" })).toBeNull();
  expect(auditFiltersError({ matchmakerId: "m", actorUserId: "u" })).toMatch(
    /not both/,
  );
  expect(auditFiltersError({ candidateId: "c", actorUserId: "u" })).toMatch(
    /not both/,
  );
});
