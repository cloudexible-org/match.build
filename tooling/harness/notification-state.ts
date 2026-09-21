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
 */
export async function waitForDelivery(
  conversationId: string,
  channel: "push" | "email",
  timeoutMs = 15_000,
): Promise<Delivery> {
  const deadline = Date.now() + timeoutMs;
  let last: Delivery | undefined;
  for (;;) {
    last = (await deliveries(conversationId)).find(
      (row) => row.channel === channel,
    );
    if (last !== undefined && last.status !== "scheduled") return last;
    if (Date.now() > deadline) {
      throw new Error(
        `${channel} notification for ${conversationId} never settled (last: ${last?.status ?? "none"})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
