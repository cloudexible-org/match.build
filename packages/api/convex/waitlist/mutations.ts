import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { findByEmail, optionalText } from "./helpers";
import {
  emailError,
  instagramError,
  nameError,
  normaliseEmail,
  normaliseInstagram,
  WAITLIST_LIMITS,
} from "./rules";

/**
 * Join the waitlist. Public and unauthenticated — the marketing site has no
 * auth — so it validates everything and reveals nothing.
 *
 * Idempotent on email: a repeat sign-up fills in any fields the first one left
 * blank and never overwrites what was already given. It returns `null` either
 * way, so the endpoint cannot be used to test whether an address is on the
 * list.
 */
export const join = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    instagram: v.optional(v.string()),
    source: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const error =
      emailError(args.email) ??
      nameError(args.name ?? "") ??
      instagramError(args.instagram ?? "");
    if (error) throw new ConvexError(error);

    const email = normaliseEmail(args.email);
    const name = optionalText(args.name);
    const instagram = optionalText(normaliseInstagram(args.instagram ?? ""));
    const source = args.source.trim().slice(0, WAITLIST_LIMITS.source);

    const existing = await findByEmail(ctx, email);
    if (existing) {
      const patch = {
        ...(existing.name === undefined && name ? { name } : {}),
        ...(existing.instagram === undefined && instagram ? { instagram } : {}),
      };
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("waitlist", existing._id, patch);
      }
      return null;
    }

    await ctx.db.insert("waitlist", { email, name, instagram, source });
    return null;
  },
});
