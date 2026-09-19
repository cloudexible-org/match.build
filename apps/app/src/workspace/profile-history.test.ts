import { describe, expect, test } from "vitest";
import { describeProfileEvent } from "./profile-history";

describe("describeProfileEvent", () => {
  test("describes creation as one line, whatever it recorded", () => {
    expect(
      describeProfileEvent("matchmaker.created", [
        { field: "username", after: '"jane.smith"' },
      ]),
    ).toEqual(["Created the profile"]);
  });

  test("describes each update as set, changed or removed", () => {
    expect(
      describeProfileEvent("matchmaker.updated", [
        { field: "displayName", before: '"Jane"', after: '"Jane Smith"' },
        { field: "businessName", after: '"Smith & Co"' },
      ]),
    ).toEqual([
      "Changed display name from “Jane” to “Jane Smith”",
      "Set business name to “Smith & Co”",
    ]);
    expect(
      describeProfileEvent("matchmaker.updated", [
        { field: "businessName", before: '"Smith & Co"' },
      ]),
    ).toEqual(["Removed business name “Smith & Co”"]);
  });

  test("falls back to the raw action or value rather than failing", () => {
    expect(describeProfileEvent("matchmaker.renamed", [])).toEqual([
      "matchmaker.renamed",
    ]);
    expect(
      describeProfileEvent("matchmaker.updated", [
        { field: "displayName", before: "not json", after: '"Jane"' },
      ]),
    ).toEqual(["Changed display name from “not json” to “Jane”"]);
  });
});
