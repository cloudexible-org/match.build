import { adminClient } from "./admin-client";

/**
 * What the deployment did about a conversation's notifications, read through
 * `internal.notifications.queries.deliveries`.
 *
 * A notification is defined by what happens *later*, so a spec has to be able
 * to look at the record rather than at the screen: the email lands in the
 * outbox, and the push leaves for a service we don't own.
 */

export type Delivery = {
  channel: "push" | "email";
  status: string;
  triggerSeq: number;
  scheduledFor: number;
  sentAt?: number;
  subscriptions: number;
};

export async function deliveries(conversationId: string): Promise<Delivery[]> {
  return (await adminClient().query(
    // By string: the harness does not depend on the backend's generated API.
    "notifications/queries:deliveries" as never,
    { conversationId } as never,
  )) as Delivery[];
}

/**
 * Waits until a conversation's `channel` notification reaches a final state,
 * and returns it. Polls because the work is a scheduled job followed by a
 * scheduled action, and neither is observable from the browser.
 *
 * A settled `status` is not the end of the story. `mutations.deliver` writes
 * `sent` *before* handing the send to the action — the action patches `failed`
 * if it can't — so the row stops saying `scheduled` while the request is still
 * in flight, and anything the send's own result causes lands later still. Pass
 * `until` to wait for that too: a spec asserting on what the push service's
 * answer did must wait for the change itself, not for the status.
 */
export async function waitForDelivery(
  conversationId: string,
  channel: "push" | "email",
  options: {
    /** Waited for in addition to the row settling, not instead of it. */
    until?: (delivery: Delivery) => boolean;
    timeoutMs?: number;
  } = {},
): Promise<Delivery> {
  const { until, timeoutMs = 15_000 } = options;
  const deadline = Date.now() + timeoutMs;
  let last: Delivery | undefined;
  for (;;) {
    last = (await deliveries(conversationId)).find(
      (row) => row.channel === channel,
    );
    if (
      last !== undefined &&
      last.status !== "scheduled" &&
      (until === undefined || until(last))
    ) {
      return last;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${channel} notification for ${conversationId} never settled (last: ${describe(last)})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** What the row looked like when we gave up, for the timeout message. */
function describe(delivery: Delivery | undefined): string {
  if (delivery === undefined) return "no row";
  return `status=${delivery.status}, subscriptions=${delivery.subscriptions}`;
}
