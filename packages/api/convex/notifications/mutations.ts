import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import { requireUser } from "../users/helpers";
import { notificationSettingsFor, readSeqFor } from "./helpers";
import { DEFAULT_NOTIFICATION_SETTINGS } from "./rules";

/*
 * Notifications (prd/phase-1.md §8.1). Nothing here sends anything: sending
 * happens in `./actions.ts`, scheduled from `deliver` once it has decided the
 * notification is still wanted.
 */

/**
 * Fires at a scheduled notification's time and decides whether to send it.
 *
 * This is the whole point of the delay: by now the recipient may have read the
 * message, in which case nothing is sent and the row records `skipped_seen`.
 * The decision is made from the conversation as it is **now**, never from what
 * was true when the message was written.
 */
export const deliver = internalMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    // Superseded, already answered, or the row is gone: nothing owed.
    if (notification === null || notification.status !== "scheduled") {
      return null;
    }
    const conversation = await ctx.db.get(
      "conversations",
      notification.conversationId,
    );
    const candidate =
      conversation === null
        ? null
        : await ctx.db.get("candidates", conversation.candidateId);
    if (conversation === null || candidate === null) {
      await ctx.db.patch("notifications", notification._id, {
        status: "failed",
      });
      return null;
    }

    const side =
      candidate.userId === notification.userId ? "candidate" : "matchmaker";
    if (readSeqFor(conversation, side) >= notification.triggerSeq) {
      await ctx.db.patch("notifications", notification._id, {
        status: "skipped_seen",
      });
      return null;
    }

    // `skipped_disabled` covers both "they turned this channel off" and "this
    // channel isn't theirs to receive any more" — a candidate who left stops
    // being notified about a conversation they can no longer open.
    const settings = await notificationSettingsFor(ctx, notification.userId);
    const enabled =
      notification.channel === "email"
        ? settings.emailEnabled
        : settings.pushEnabled;
    if (
      !enabled ||
      (side === "candidate" && candidate.membership !== "joined")
    ) {
      await ctx.db.patch("notifications", notification._id, {
        status: "skipped_disabled",
      });
      return null;
    }

    // Marked sent before the send: the action patches `failed` if it can't.
    await ctx.db.patch("notifications", notification._id, {
      status: "sent",
      sentAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.actions.sendMessageNotice,
      { notificationId: notification._id },
    );
    return null;
  },
});

/** Records that a send failed, so the row doesn't claim it went out. */
export const recordFailure = internalMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (notification === null) return null;
    await ctx.db.patch("notifications", notification._id, { status: "failed" });
    return null;
  },
});

/*
 * ─── What the account controls ──────────────────────────────────────────────
 */

/**
 * Turns each channel on or off (prd §8.1). Not audited: a preference is not
 * state a matchmaker has any business seeing (§5.1).
 */
export const setChannels = mutation({
  args: { emailEnabled: v.boolean(), pushEnabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const next = {
      emailEnabled: args.emailEnabled,
      pushEnabled: args.pushEnabled,
    };
    if (existing === null) {
      await ctx.db.insert("notificationSettings", {
        userId: user._id,
        ...next,
      });
    } else {
      await ctx.db.patch("notificationSettings", existing._id, next);
    }
    return null;
  },
});

/**
 * Stores a browser's push subscription (prd §8.2). One row per endpoint: a
 * browser can hand out the same endpoint again after a permission reset, and
 * re-subscribing must not leave a duplicate behind. An endpoint that belonged
 * to another account is taken over — the browser only ever has one at a time.
 */
export const subscribePush = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.endpoint.startsWith("https://")) {
      throw new ConvexError("That push endpoint isn't valid.");
    }
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing === null) {
      await ctx.db.insert("pushSubscriptions", { userId: user._id, ...args });
    } else {
      await ctx.db.patch("pushSubscriptions", existing._id, {
        userId: user._id,
        ...args,
      });
    }
    return null;
  },
});

/** Forgets one browser's subscription, when it is turned off in the app. */
export const unsubscribePush = mutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    // Only your own, and silent about anyone else's.
    if (existing !== null && existing.userId === user._id) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Removes a subscription a push service has rejected as gone (404/410, prd
 * §8.2). Auth plumbing, not audited data, so it is really deleted.
 */
export const dropSubscription = internalMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Records that the notifications panel has just been opened, which is the
 * whole of "read" for it (rules.ts, "The in-app panel").
 *
 * Deliberately **not** a read marker on any conversation: opening the bell is
 * not reading the message, so the thread stays unread, the workspace keeps
 * its count, and a push or email already scheduled still fires. Not audited,
 * for the same reason a channel preference isn't (§5.1).
 */
export const markFeedSeen = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const feedSeenAt = Date.now();
    if (existing === null) {
      await ctx.db.insert("notificationSettings", {
        userId: user._id,
        ...DEFAULT_NOTIFICATION_SETTINGS,
        feedSeenAt,
      });
    } else {
      await ctx.db.patch("notificationSettings", existing._id, { feedSeenAt });
    }
    return null;
  },
});
