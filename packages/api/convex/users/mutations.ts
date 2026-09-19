import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { requireUser } from "./helpers";
import { accountNameError, normaliseName } from "./rules";

// Far above anyone's real number of matchmakers; bounds the fan-out below.
const MAX_MEMBERSHIPS = 100;

/**
 * Sets the account's name — first at sign-up, then from settings.
 *
 * Audited as `account.name_changed` at account level, and once more in the
 * trail of each matchmaker the person has joined, since those matchmakers see
 * this name. Each copy lives only in its own matchmaker's trail, so no
 * matchmaker learns who else the person is with.
 */
export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const error = accountNameError(args.name);
    if (error) throw new ConvexError(error);

    const user = await requireUser(ctx);
    const name = normaliseName(args.name);
    if (name === user.name) return null;

    await ctx.db.patch("users", user._id, { name });

    const change = { field: "name", before: user.name, after: name };
    const entity = { table: "users", id: user._id } as const;
    await recordAudit(ctx, {
      actor: { type: "user", userId: user._id, role: "account" },
      action: "account.name_changed",
      entity,
      changes: [change],
    });

    const memberships = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) => q.eq("userId", user._id))
      .take(MAX_MEMBERSHIPS);
    for (const candidate of memberships) {
      if (candidate.membership !== "joined") continue;
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor: { type: "user", userId: user._id, role: "candidate" },
        action: "account.name_changed",
        entity,
        changes: [change],
      });
    }
    return null;
  },
});
