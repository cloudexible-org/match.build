import { ConvexError } from "convex/values";

/**
 * The message a Convex function threw on purpose (`throw new ConvexError(
 * "…")`), which is written for people, or `fallback` for anything else —
 * network failures and bugs, whose text isn't.
 */
export function serverErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return fallback;
}
