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
