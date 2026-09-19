import { describe, expect, test } from "vitest";
import {
  changeAuditFilter,
  hasAuditFilters,
  readAuditFilters,
  writeAuditFilters,
} from "./audit-filters";

describe("URL round trip", () => {
  test("reads the short param names and ignores blanks", () => {
    expect(
      readAuditFilters(
        new URLSearchParams("matchmaker=m1&candidate=c1&action=&account=%20"),
      ),
    ).toEqual({ matchmakerId: "m1", candidateId: "c1" });
  });

  test("writes only what is set", () => {
    expect(
      writeAuditFilters({
        actorUserId: "u1",
        action: "note.created",
      }).toString(),
    ).toBe("account=u1&action=note.created");
  });
});

describe("changeAuditFilter", () => {
  test("a new matchmaker drops the candidate and the account", () => {
    expect(
      changeAuditFilter(
        { matchmakerId: "m1", candidateId: "c1", action: "note.created" },
        { matchmakerId: "m2" },
      ),
    ).toEqual({ matchmakerId: "m2", action: "note.created" });
    expect(
      changeAuditFilter({ actorUserId: "u1" }, { matchmakerId: "m1" }),
    ).toEqual({ matchmakerId: "m1" });
  });

  test("choosing a candidate keeps its matchmaker", () => {
    expect(
      changeAuditFilter({ matchmakerId: "m1" }, { candidateId: "c1" }),
    ).toEqual({ matchmakerId: "m1", candidateId: "c1" });
  });

  test("an account replaces a matchmaker and candidate", () => {
    expect(
      changeAuditFilter(
        { matchmakerId: "m1", candidateId: "c1", action: "x" },
        { actorUserId: "u1" },
      ),
    ).toEqual({ actorUserId: "u1", action: "x" });
  });

  test("clearing a filter removes it", () => {
    expect(
      changeAuditFilter({ matchmakerId: "m1", action: "x" }, { action: "" }),
    ).toEqual({ matchmakerId: "m1" });
    expect(
      changeAuditFilter(
        { matchmakerId: "m1", candidateId: "c1" },
        { matchmakerId: undefined },
      ),
    ).toEqual({});
  });
});

test("hasAuditFilters", () => {
  expect(hasAuditFilters({})).toBe(false);
  expect(hasAuditFilters({ action: "x" })).toBe(true);
});
