import { AUDIT_ACTIONS } from "@repo/api";
import { expect, test } from "vitest";
import {
  ACTION_LABELS,
  actionLabel,
  actorText,
  changeText,
} from "./audit-labels";

test("every audit action has a label", () => {
  expect(Object.keys(ACTION_LABELS).sort()).toEqual([...AUDIT_ACTIONS].sort());
  expect(actionLabel("note.created")).toBe("Note added");
  expect(actionLabel("something.new")).toBe("something.new");
});

test("actorText names the account and its role, or the job", () => {
  expect(actorText({ type: "user", role: "matchmaker" }, "Jane")).toBe(
    "Jane (matchmaker)",
  );
  expect(actorText({ type: "user", role: "platform_admin" }, null)).toBe(
    "Unknown account (platform admin)",
  );
  expect(actorText({ type: "system", job: "invite_expiry" }, null)).toBe(
    "System: invite_expiry",
  );
});

test("changeText decodes JSON and marks absent values", () => {
  expect(changeText({ field: "name", before: '"Jane"', after: '"Jan"' })).toBe(
    "name: “Jane” → “Jan”",
  );
  expect(changeText({ field: "businessName", after: '"Acme"' })).toBe(
    "businessName: — → “Acme”",
  );
  expect(
    changeText({
      field: "socialHandles",
      before: "[]",
      after: '[{"platform":"x","handle":"j"}]',
    }),
  ).toBe('socialHandles: [] → [{"platform":"x","handle":"j"}]');
});
