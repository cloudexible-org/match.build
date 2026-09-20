import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { sendAccountDeletionCode } from "../email/helpers";

/**
 * Emails the code that confirms deleting an account (prd/phase-1.md §3.5),
 * scheduled by `users.mutations.requestDeletionCode`.
 *
 * The code arrives as an argument: only its hash is stored, so there is
 * nothing to read back here (see that mutation for why that trade is the right
 * way round).
 */
export const sendDeletionCode = internalAction({
  args: { to: v.string(), code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await sendAccountDeletionCode(ctx, args.to, args.code);
    return null;
  },
});
