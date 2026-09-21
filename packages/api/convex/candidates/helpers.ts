import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireUser } from "../users/helpers";

/**
 * Access for candidate-facing functions (prd/phase-1.md §9.2): the signed-in
 * user must be this candidate record's linked account, and still a member.
 * Once they leave or delete their account the conversation is closed to them.
 *
 * Callers must only ever return `visibility: "everyone"` messages and nothing
 * the matchmaker keeps privately (notes, audit trail, candidate details).
 */
export async function requireCandidateSelf(
  ctx: QueryCtx,
  candidateId: Id<"candidates">,
): Promise<{ user: Doc<"users">; candidate: Doc<"candidates"> }> {
  const user = await requireUser(ctx);
  const candidate = await ctx.db.get("candidates", candidateId);
  if (
    candidate === null ||
    candidate.userId !== user._id ||
    candidate.membership !== "joined"
  ) {
    throw new ConvexError("Conversation not found.");
  }
  return { user, candidate };
}

/**
 * What to call the candidate when an agent has to address or discuss them.
 *
 * Lives here rather than beside either agent because both of them ask: the
 * drafting run greets them by it, and the profile run keeps their record under
 * it.
 *
 * The app falls back to the email address, which is right for a list and wrong
 * for a greeting — "Hi sam.candidate@matchmaker-dev.test" is not a draft
 * anybody sends. So: the matchmaker's own label for them, then the name on the
 * account they joined with, and only then the part of the address before the
 * `@`, which at least reads like a person.
 */
export async function candidateDisplayName(
  ctx: QueryCtx,
  candidate: Doc<"candidates">,
): Promise<string> {
  if (candidate.name !== undefined && candidate.name !== "") {
    return candidate.name;
  }
  if (candidate.userId !== undefined) {
    const user = await ctx.db.get("users", candidate.userId);
    if (user?.name !== undefined && user.name !== "") return user.name;
  }
  return candidate.email.split("@")[0] ?? candidate.email;
}
