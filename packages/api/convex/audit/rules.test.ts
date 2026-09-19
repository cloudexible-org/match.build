import { describe, expect, test } from "vitest";
import { AUDIT_ACTIONS, diffFields, isAuditAction } from "./rules";

describe("diffFields", () => {
  const before = {
    name: "Jane",
    email: "jane@gmial.com",
    socialHandles: [{ platform: "instagram", handle: "jane" }],
  };

  test("reports only the fields that changed", () => {
    expect(
      diffFields(before, { name: "Jane", email: "jane@gmail.com" }, [
        "name",
        "email",
      ]),
    ).toEqual([
      { field: "email", before: "jane@gmial.com", after: "jane@gmail.com" },
    ]);
  });

  test("compares arrays structurally", () => {
    expect(
      diffFields(
        before,
        { socialHandles: [{ platform: "instagram", handle: "jane" }] },
        ["socialHandles"],
      ),
    ).toEqual([]);
  });

  test("ignores fields absent from the update", () => {
    expect(diffFields(before, {}, ["name", "email"])).toEqual([]);
  });

  test("records a field being cleared", () => {
    expect(diffFields(before, { name: undefined }, ["name"])).toEqual([
      { field: "name", before: "Jane", after: undefined },
    ]);
  });
});

test("isAuditAction accepts only listed actions", () => {
  expect(AUDIT_ACTIONS.every(isAuditAction)).toBe(true);
  expect(isAuditAction("message.sent")).toBe(false);
});
