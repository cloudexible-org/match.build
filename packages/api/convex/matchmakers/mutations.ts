import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { diffFields } from "../audit/rules";
import { requireUser } from "../users/helpers";
import { normaliseName } from "../users/rules";
import { requireMatchmaker } from "./helpers";
import {
  displayNameError,
  normaliseUsername,
  usernameError,
  usernameKey,
} from "./rules";

/**
 * Creates a matchmaker profile owned by the signed-in account (prd/phase-1.md
 * §1). Uniqueness is on the canonical key, so `jane.smith` is refused once
 * `janesmith` exists.
 *
 * The UI offers this only to accounts without a profile, but the backend
 * deliberately allows several per account (§1).
 */
export const create = mutation({
  args: {
    username: v.string(),
    displayName: v.string(),
  },
  returns: v.object({
    matchmakerId: v.id("matchmakers"),
    username: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const invalid =
      usernameError(args.username) ?? displayNameError(args.displayName);
    if (invalid) throw new ConvexError(invalid);

    const username = normaliseUsername(args.username);
    const key = usernameKey(username);
    const taken = await ctx.db
      .query("matchmakers")
      .withIndex("by_usernameKey", (q) => q.eq("usernameKey", key))
      .first();
    if (taken !== null) throw new ConvexError("That username is taken.");

    const profile = {
      username,
      displayName: normaliseName(args.displayName),
    };
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: user._id,
      usernameKey: key,
      ...profile,
    });

    await recordAudit(ctx, {
      matchmakerId,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "matchmaker.created",
      entity: { table: "matchmakers", id: matchmakerId },
      changes: diffFields<Partial<typeof profile>>({}, profile, [
        "username",
        "displayName",
      ]),
    });
    return { matchmakerId, username };
  },
});

/**
 * Updates the profile's display name and business name from settings. The
 * username is immutable (§1.1): it is the URL.
 */
export const update = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    displayName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const invalid = displayNameError(args.displayName);
    if (invalid) throw new ConvexError(invalid);

    const next = { displayName: normaliseName(args.displayName) };
    const changes = diffFields(matchmaker, next, ["displayName"]);
    if (changes.length === 0) return null;

    await ctx.db.patch("matchmakers", matchmaker._id, next);
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "matchmaker.updated",
      entity: { table: "matchmakers", id: matchmaker._id },
      changes,
    });
    return null;
  },
});
