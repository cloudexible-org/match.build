import { v } from "convex/values";
import { internal } from "../_generated/api";
import { type ActionCtx, env, internalAction } from "../_generated/server";
import { sendEmail } from "../email/helpers";
import {
  encryptPushPayload,
  PUSH_TTL_SECONDS,
  type PushSubscription,
  vapidAuthorization,
  vapidKeys,
} from "./helpers";
import {
  type MembershipEvent,
  membershipEmail,
  membershipPush,
  NOTIFICATION_FROM,
  newMessageEmail,
  newMessagePush,
  type PushPayload,
} from "./rules";

/*
 * Sending notifications (prd/phase-1.md §8). Every function here is scheduled
 * by a mutation that already decided the notification is wanted; none of them
 * decides anything about read markers or preferences.
 */

/** Joins a path from `./rules.ts` to the app's own URL. */
function link(path: string): string {
  if (!env.SITE_URL) {
    throw new Error("SITE_URL is not set, so a notification has no link.");
  }
  return `${env.SITE_URL.replace(/\/$/, "")}/${path}`;
}

/**
 * Sends one new-message notification, on the channel its row names. A failure
 * is recorded on the row rather than retried: the next message schedules
 * another, and a notification nobody got is not worth waking anyone for.
 */
export const sendMessageNotice = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notice = await ctx.runQuery(
      internal.notifications.queries.messageNotice,
      args,
    );
    if (notice === null) return null;
    const url = link(notice.path);

    try {
      if (notice.channel === "email") {
        if (notice.to === null) return null;
        await sendEmail(ctx, {
          from: NOTIFICATION_FROM,
          to: notice.to,
          kind: "new_message",
          message: newMessageEmail({ fromName: notice.fromName, link: url }),
        });
      } else {
        await pushToAll(
          ctx,
          notice.subscriptions,
          newMessagePush({ fromName: notice.fromName, url }),
        );
      }
    } catch (error) {
      await ctx.runMutation(
        internal.notifications.mutations.recordFailure,
        args,
      );
      throw error;
    }
    return null;
  },
});

/**
 * Tells a matchmaker their candidate accepted, left, or deleted their account.
 * Both channels at once, each if it is on: this happens once, so there is
 * nothing to coalesce and no read marker to wait on.
 */
export const sendMembershipNotice = internalAction({
  args: {
    candidateId: v.id("candidates"),
    event: v.union(
      v.literal("accepted"),
      v.literal("left"),
      v.literal("account_deleted"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notice = await ctx.runQuery(
      internal.notifications.queries.membershipNotice,
      { candidateId: args.candidateId },
    );
    if (notice === null) return null;
    const event: MembershipEvent = args.event;
    const url = link(notice.path);

    if (notice.emailEnabled && notice.to !== null) {
      await sendEmail(ctx, {
        from: NOTIFICATION_FROM,
        to: notice.to,
        kind: "membership_changed",
        message: membershipEmail({
          candidateName: notice.candidateName,
          event,
          link: url,
        }),
      });
    }
    if (notice.pushEnabled) {
      await pushToAll(
        ctx,
        notice.subscriptions,
        membershipPush({ candidateName: notice.candidateName, event, url }),
      );
    }
    return null;
  },
});

/**
 * Pushes one payload to every browser an account has registered. One dead
 * subscription must not stop the others, so each is sent independently and a
 * rejection only removes that one.
 */
async function pushToAll(
  ctx: ActionCtx,
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<void> {
  // A deployment with no VAPID keys can't push at all (prd §8.2); email is the
  // channel that still works, and `settings` tells the app so.
  if (vapidKeys() === null || subscriptions.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map((subscription) => pushOne(ctx, subscription, body)),
  );
}

async function pushOne(
  ctx: ActionCtx,
  subscription: PushSubscription,
  payload: string,
): Promise<void> {
  const encrypted = await encryptPushPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(
        subscription.endpoint,
        Date.now(),
      ),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL_SECONDS),
    },
    body: encrypted,
  });
  if (response.ok) return;
  // The push service is telling us this browser is gone for good (prd §8.2).
  if (response.status === 404 || response.status === 410) {
    await ctx.runMutation(internal.notifications.mutations.dropSubscription, {
      endpoint: subscription.endpoint,
    });
    return;
  }
  // Anything else is transient or our fault; log it and move on rather than
  // failing a whole fan-out for one endpoint.
  console.error(
    `Push to ${new URL(subscription.endpoint).origin} failed: ${response.status}`,
  );
}
