import { expect, test } from "@playwright/test";
import { waitForNotificationEmail } from "@repo/harness/notification-emails";
import { waitForDelivery } from "@repo/harness/notification-state";
import { AccountSettingsPage } from "@repo/harness/page-objects/app/account-settings.page";
import { CandidateChatPage } from "@repo/harness/page-objects/app/candidate.page";
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import {
  clearPushKeys,
  configurePushKeys,
  fakePushEndpoint,
} from "@repo/harness/push-keys";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * Notifications (prd/phase-1.md §8.1, §8.2) against a real deployment.
 *
 * The unit suite covers the decisions — coalescing, throttling, what is
 * skipped. What only a real backend can show is that the send itself works:
 * that the deployment's own runtime can do RFC 8291 encryption and sign a
 * VAPID JWT, and that a push service's "this browser is gone" is acted on.
 *
 * The delays are set to zero for this run, so a job that would wait five
 * minutes fires at once. That is the product's own setting (prd §12), not a
 * test hook.
 */

let world: Scenario;

test.beforeAll(async () => {
  // The delays are already turned down for the whole run (`auth-env.ts`).
  // VAPID keys are not: a deployment without them must also behave, so the
  // spec that needs push sets them and puts them back.
  await configurePushKeys();
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "away", name: "Ava Away" },
      { key: "reader", name: "Remy Reader" },
      // A browser registered for push, at an endpoint that rejects it.
      { key: "pushed", name: "Pia Pushed", pushEndpoint: fakePushEndpoint() },
      { key: "off", name: "Otto Off" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      {
        key: "away",
        matchmakerKey: "book",
        userKey: "away",
        membership: "joined",
        name: "Ava Away",
      },
      {
        key: "reader",
        matchmakerKey: "book",
        userKey: "reader",
        membership: "joined",
        name: "Remy Reader",
      },
      {
        key: "pushed",
        matchmakerKey: "book",
        userKey: "pushed",
        membership: "joined",
        name: "Pia Pushed",
      },
      {
        key: "off",
        matchmakerKey: "book",
        userKey: "off",
        membership: "joined",
        name: "Otto Off",
      },
    ],
  });
});

test.afterAll(async () => {
  await clearPushKeys();
});

/** Sends one message to a seeded candidate, as their matchmaker. */
async function messageFromMatchmaker(
  page: import("@playwright/test").Page,
  candidateKey: string,
  body: string,
) {
  await signInAs(page, world.email("maya"));
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(candidateKey)}`,
  );
  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  await conversation.send(body);
  return conversation;
}

test("someone who never opens the message gets an email that doesn't quote it", async ({
  page,
}) => {
  await messageFromMatchmaker(page, "away", "Ava, I have someone in mind.");

  const email = await waitForNotificationEmail(world.email("away"));
  expect(email.subject).toBe("You have a new message from Maya's Book");
  // The whole point of §8: the message itself is never in the notification.
  expect(email.text).not.toContain("someone in mind");
  expect(email.text).toContain(`/app/c#${world.username("book")}`);
  expect(email.text).toContain("turn these emails off");

  const delivery = await waitForDelivery(world.conversationId("away"), "email");
  expect(delivery.status).toBe("sent");
});

test("someone reading the conversation is not emailed about it", async ({
  page,
  browser,
  baseURL,
}) => {
  // Remy has the chat open and the tab in front, which is what "seen" means.
  const theirs = await browser.newContext({ baseURL });
  const theirPage = await theirs.newPage();
  await signInAs(theirPage, world.email("reader"));
  await theirPage.goto(`/app/c#${world.username("book")}`);
  const chat = new CandidateChatPage(theirPage);
  await expect(chat.getRoot()).toBeVisible();

  await messageFromMatchmaker(page, "reader", "Remy, are you there?");
  // They see it arrive, so the read marker moves past it.
  await expect(chat.getMessages().last()).toContainText("are you there?");

  const delivery = await waitForDelivery(
    world.conversationId("reader"),
    "email",
  );
  expect(delivery.status).toBe("skipped_seen");
  await theirs.close();
});

test("a push is really built, signed and posted, and a dead browser is dropped", async ({
  page,
}) => {
  await messageFromMatchmaker(page, "pushed", "Pia, good news.");

  // Reaching a final state at all means the deployment encrypted the payload
  // (RFC 8291) and signed the VAPID JWT (RFC 8292) in its own runtime — those
  // both happen before the request, and a failure there would record `failed`.
  const delivery = await waitForDelivery(
    world.conversationId("pushed"),
    "push",
  );
  expect(delivery.status).toBe("sent");
  // The stand-in endpoint answers "not found" to the POST, which is a push
  // service saying the browser is gone, so its subscription is removed (§8.2).
  expect(delivery.subscriptions).toBe(0);
});

test("turning a channel off in settings stops it", async ({ page }) => {
  await signInAs(page, world.email("off"));
  const settings = new AccountSettingsPage(page);
  await settings.goto();
  const email = page.getByTestId("notify-email-toggle");
  await expect(email).toHaveText("On");
  await email.click();
  await expect(email).toHaveText("Off");

  await messageFromMatchmaker(page, "off", "Otto, still here?");
  const delivery = await waitForDelivery(world.conversationId("off"), "email");
  expect(delivery.status).toBe("skipped_disabled");
});

test("the settings page says why push isn't on offer without keys", async ({
  page,
}) => {
  await clearPushKeys();
  try {
    await signInAs(page, world.email("maya"));
    const settings = new AccountSettingsPage(page);
    await settings.goto();
    await expect(page.getByTestId("notify-push-blocked")).toContainText(
      /aren't set up|can't show/,
    );
    await expect(page.getByTestId("notify-push-toggle")).toBeHidden();
    // Email is unaffected: it is the channel that always works.
    await expect(page.getByTestId("notify-email-toggle")).toBeVisible();
  } finally {
    await configurePushKeys();
  }
});
