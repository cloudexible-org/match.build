import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/** Stores an email that was not sent because no Resend key is configured. */
export const recordOutbox = internalMutation({
  args: {
    to: v.string(),
    kind: v.union(
      v.literal("sign_in_code"),
      v.literal("invite"),
      v.literal("account_deletion_code"),
      v.literal("new_message"),
      v.literal("membership_changed"),
    ),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("emailOutbox", args);
    return null;
  },
});
