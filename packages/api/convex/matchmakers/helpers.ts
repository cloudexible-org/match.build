import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireUser } from "../users/helpers";

/**
 * Tenant access for the matchmaker workspace (prd/phase-1.md §9.2).
 *
 * Workspace functions receive `matchmakerId` from the URL-selected workspace,
 * so the argument itself proves nothing: this checks that the signed-in user
 * owns that profile. Not-found and not-yours raise the same error, so an id
 * cannot be probed for existence.
 */
export async function requireMatchmaker(
  ctx: QueryCtx,
  matchmakerId: Id<"matchmakers">,
): Promise<{ user: Doc<"users">; matchmaker: Doc<"matchmakers"> }> {
  const user = await requireUser(ctx);
  const matchmaker = await ctx.db.get("matchmakers", matchmakerId);
  if (matchmaker === null || matchmaker.ownerUserId !== user._id) {
    throw new ConvexError("Matchmaker profile not found.");
  }
  return { user, matchmaker };
}

/**
 * Throws unless a document loaded by id belongs to the tenant the caller was
 * authorised for. Use it on every candidate, conversation, note or request a
 * workspace function loads from an argument.
 */
export function assertSameTenant<T extends { matchmakerId: Id<"matchmakers"> }>(
  doc: T | null,
  matchmakerId: Id<"matchmakers">,
): asserts doc is T {
  if (doc === null || doc.matchmakerId !== matchmakerId) {
    throw new ConvexError("Not found.");
  }
}
