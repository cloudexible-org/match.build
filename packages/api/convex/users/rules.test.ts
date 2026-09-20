import { describe, expect, test } from "vitest";
import { accountNameError, deletionCodeError, normaliseName } from "./rules";

describe("the account name", () => {
  test("is trimmed, collapsed and required", () => {
    expect(normaliseName("  Jane   Doe ")).toBe("Jane Doe");
    expect(accountNameError("  ")).toBe("Enter your name.");
    expect(accountNameError("a".repeat(61))).toBe("That name is too long.");
    expect(accountNameError(" Jane ")).toBeNull();
  });
});

describe("the account deletion code", () => {
  test("must be exactly the emailed number of digits", () => {
    expect(deletionCodeError("", 6)).toBe("Enter the code we emailed you.");
    expect(deletionCodeError(" 12345 ", 6)).toBe("The code is 6 digits.");
    expect(deletionCodeError("1234567", 6)).toBe("The code is 6 digits.");
    expect(deletionCodeError("12345a", 6)).toBe("The code is 6 digits.");
    expect(deletionCodeError(" 004213 ", 6)).toBeNull();
  });
});
