import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery, query } from "../_generated/server";
import { getCurrentUser } from "../users/helpers";
import { notificationSettingsFor, vapidKeys } from "./helpers";
import { candidateChatPath, workspaceConversationPath } from "./rules";

/**
 * What `/settings` needs to render the notification controls (prd §8.1), or
 * `null` when signed out.
 *
 * `vapidPublicKey` is what the browser subscribes with. It is public by
 * design — the private half never leaves the deployment — and `null` means
 * this deployment has no push keys, so the app offers email only.
 */
export const settings = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      emailEnabled: v.boolean(),
      pushEnabled: v.boolean(),
      email: v.optional(v.string()),
      vapidPublicKey: v.union(v.null(), v.string()),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const stored = await notificationSettingsFor(ctx, user._id);
    return {
      ...stored,
      email: user.email,
      vapidPublicKey: vapidKeys()?.publicKeyBase64url ?? null,
    };
  },
});

/** One recipient's push subscriptions, for an action about to send. */
const subscription = v.object({
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
});

/**
 * Everything `actions.sendMessageNotice` needs, or `null` when there is
 * nothing to send to. Internal: it names an account's email address.
 *
 * Deliberately no message body. A notification says who wrote, never what
 * they wrote (prd §8, §9.3).
 */
export const messageNotice = internalQuery({
  args: { notificationId: v.id("notifications") },
  returns: v.union(
    v.null(),
    v.object({
      channel: v.union(v.literal("push"), v.literal("email")),
      fromName: v.string(),
      path: v.string(),
      to: v.union(v.null(), v.string()),
      subscriptions: v.array(subscription),
    }),
  ),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (notification === null) return null;
    const conversation = await ctx.db.get(
      "conversations",
      notification.conversationId,
    );
    const candidate =
      conversation === null
        ? null
        : await ctx.db.get("candidates", conversation.candidateId);
    const matchmaker =
      candidate === null
        ? null
        : await ctx.db.get("matchmakers", candidate.matchmakerId);
    if (candidate === null || matchmaker === null) return null;

    // The recipient is whichever side isn't the sender, so the name on the
    // notification is the other one's.
    const toCandidate = candidate.userId === notification.userId;
    const account =
      candidate.userId === undefined
        ? null
        : await ctx.db.get("users", candidate.userId);
    const recipient = toCandidate
      ? account
      : await ctx.db.get("users", matchmaker.ownerUserId);
    if (recipient === null) return null;

    return {
      channel: notification.channel,
      fromName: toCandidate
        ? matchmaker.displayName
        : candidateDisplayName(candidate, account),
      path: toCandidate
        ? candidateChatPath(matchmaker.username)
        : workspaceConversationPath(matchmaker.username, candidate._id),
      to: recipient.email ?? null,
      subscriptions: await subscriptionsFor(ctx, recipient._id),
    };
  },
});

/**
 * Everything `actions.sendMembershipNotice` needs: the matchmaker's own
 * address and subscriptions, and what to call the candidate. Returns `null`
 * when the matchmaker has that channel off, so the action sends nothing.
 */
export const membershipNotice = internalQuery({
  args: { candidateId: v.id("candidates") },
  returns: v.union(
    v.null(),
    v.object({
      candidateName: v.string(),
      path: v.string(),
      to: v.union(v.null(), v.string()),
      emailEnabled: v.boolean(),
      pushEnabled: v.boolean(),
      subscriptions: v.array(subscription),
    }),
  ),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    const matchmaker =
      candidate === null
        ? null
        : await ctx.db.get("matchmakers", candidate.matchmakerId);
    if (candidate === null || matchmaker === null) return null;
    const owner = await ctx.db.get("users", matchmaker.ownerUserId);
    if (owner === null || owner.deletedAt !== undefined) return null;
    const account =
      candidate.userId === undefined
        ? null
        : await ctx.db.get("users", candidate.userId);
    const settings = await notificationSettingsFor(ctx, owner._id);

    return {
      candidateName: candidateDisplayName(candidate, account),
      path: workspaceConversationPath(matchmaker.username, candidate._id),
      to: owner.email ?? null,
      ...settings,
      subscriptions: await subscriptionsFor(ctx, owner._id),
    };
  },
});

/** Bounded: nobody has more browsers than this, and it caps the fan-out. */
const MAX_SUBSCRIPTIONS = 20;

async function subscriptionsFor(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_SUBSCRIPTIONS);
  return rows.map((row) => ({
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  }));
}

/**
 * What to call a candidate in something their matchmaker reads: the
 * matchmaker's own label for them, else the name on the linked account, else
 * the address they were invited at — the same order the workspace uses.
 */
function candidateDisplayName(
  candidate: Doc<"candidates">,
  account: Doc<"users"> | null,
): string {
  return candidate.name ?? account?.name ?? candidate.email;
}

/**
 * What happened to a conversation's notifications: one row per channel per
 * recipient, plus whether that recipient still has any browser registered for
 * push.
 *
 * Internal. It answers "why didn't I get an email?" from the Convex dashboard,
 * which is otherwise guesswork, and it is what the e2e suite asserts the real
 * send path against. Never public: it names who is being notified about whom.
 */
export const deliveries = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(
    v.object({
      channel: v.union(v.literal("push"), v.literal("email")),
      status: v.string(),
      triggerSeq: v.number(),
      scheduledFor: v.number(),
      sentAt: v.optional(v.number()),
      /** Browsers still registered for this recipient. */
      subscriptions: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (conversation === null) return [];
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_conversationId_and_userId_and_channel", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .take(50);
    const result = [];
    for (const row of rows) {
      result.push({
        channel: row.channel,
        status: row.status,
        triggerSeq: row.triggerSeq,
        scheduledFor: row.scheduledFor,
        sentAt: row.sentAt,
        subscriptions: (await subscriptionsFor(ctx, row.userId)).length,
      });
    }
    return result;
  },
});
