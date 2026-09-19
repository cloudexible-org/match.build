import { expect, test } from "vitest";
import {
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
