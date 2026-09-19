import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { issueSignInCode, requirePlatformAdmin } from "./helpers";

/**
 * Issues a sign-in code for any account, for a platform admin to sign in as it
 * (support, reproducing a bug). Nothing is emailed: the code comes back here,
 * and the admin enters it on the app's sign-in page under "I already have a
 * code". It lasts as long as an emailed code and replaces any unused one.
 *
 * Audited as `account.sign_in_code_issued` on the account, with the admin as
 * the actor, in the same mutation.
 */
export const issueSignInCodeFor = mutation({
  args: { userId: v.id("users") },
  returns: v.object({
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) throw new ConvexError("Account not found.");

    const issued = await issueSignInCode(ctx, user);
    await recordAudit(ctx, {
      actor: { type: "user", userId: admin._id, role: "platform_admin" },
      action: "account.sign_in_code_issued",
      entity: { table: "users", id: user._id },
    });
    return issued;
  },
});
