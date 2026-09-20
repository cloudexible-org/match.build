import { expect, test } from "vitest";
import {
  accountDeletionCodeEmail,
  generateSignInCode,
  SIGN_IN_CODE_LENGTH,
  signInCodeEmail,
} from "./rules";

test("codes are zero-padded digits of a fixed length", () => {
  expect(generateSignInCode(() => 42)).toBe("000042");
  for (let i = 0; i < 50; i++) {
    expect(generateSignInCode()).toMatch(
      new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`),
    );
  }
});

test("values that would bias the distribution are redrawn", () => {
  const draws = [2 ** 32 - 1, 7];
  expect(generateSignInCode(() => draws.shift() ?? 0)).toBe("000007");
});

test("the email carries the code in subject and body", () => {
  const message = signInCodeEmail("123456");
  expect(message.subject).toContain("123456");
  expect(message.text).toContain("123456");
  expect(message.html).toContain("123456");
});

test("the deletion code email carries the code and says matchmakers keep their copies", () => {
  const message = accountDeletionCodeEmail("654321");
  expect(message.subject).toContain("654321");
  expect(message.text).toContain("654321");
  expect(message.html).toContain("654321");
  // prd/phase-1.md §3.5: nobody should be surprised by this afterwards.
  expect(message.text).toContain("keep their copy of your past conversations");
  // And a clear way out for someone who didn't ask.
  expect(message.text).toContain("nothing has been deleted");
});
