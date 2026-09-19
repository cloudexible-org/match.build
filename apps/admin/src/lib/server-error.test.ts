import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { serverErrorMessage } from "./server-error";

test("shows a ConvexError's message and hides everything else", () => {
  const fallback = "Something went wrong.";
  expect(
    serverErrorMessage(new ConvexError("That username is taken."), fallback),
  ).toBe("That username is taken.");
  expect(serverErrorMessage(new ConvexError({ code: 1 }), fallback)).toBe(
    fallback,
  );
  expect(serverErrorMessage(new Error("socket hang up"), fallback)).toBe(
    fallback,
  );
});
