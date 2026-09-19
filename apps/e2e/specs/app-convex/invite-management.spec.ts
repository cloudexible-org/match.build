import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../../accounts";
import { waitForInviteLink } from "../../invite-emails";
import { InvitePage } from "../../page-objects/app/invite.page";
import {
  ConversationPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * What the matchmaker can do with an invitation (prd/phase-1.md §3.2): copy
 * the link, resend it within the daily limit, change the address, revoke it,
 * and re-invite someone who declined or left.
 *
 * One seeded candidate per test. `invitesSentToday` puts the send limit
 * within reach without sending two emails first.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [{ key: "maya", name: "Maya Maker" }, { key: "sam" }],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      { key: "copyable", matchmakerKey: "book", name: "Copy Target" },
      {
        key: "at-limit",
        matchmakerKey: "book",
        name: "Limit Target",
        invitesSentToday: 2, // one more send allowed, then refused
      },
      { key: "revokable", matchmakerKey: "book", name: "Revoke Target" },
      { key: "changeable", matchmakerKey: "book", name: "Change Target" },
      { key: "clash", matchmakerKey: "book", name: "Clash Target" },
      {
        key: "declined",
        matchmakerKey: "book",
        name: "Declined Person",
        membership: "declined",
        membershipChangedDaysAgo: 3,
      },
      {
        key: "departed",
        matchmakerKey: "book",
        name: "Departed Person",
        userKey: "sam",
        membership: "left",
        membershipChangedDaysAgo: 30,
      },
    ],
  });
});

test.beforeEach(async ({ page }) => {
  await signInAs(page, world.email("maya"));
});

/** Opens one seeded candidate's conversation. */
async function openConversation(
  page: import("@playwright/test").Page,
  key: string,
) {
  await page.goto(
    `/app/mm/${world.username("book")}/c/${world.candidateId(key)}`,
  );
  const conversation = new ConversationPage(page);
  await expect(conversation.getRoot()).toBeVisible();
  return conversation;
}

test("the invite link is shown, copyable and the same after a reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const conversation = await openConversation(page, "copyable");

  const link = conversation.getInviteLink();
  await expect(link).toHaveValue(
    new RegExp(`${world.invitePath("copyable")}$`),
  );
  const value = await link.inputValue();

  await conversation.getCopyInviteLinkButton().click();
  await expect(conversation.getCopyInviteLinkButton()).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);

  await page.reload();
  await expect(conversation.getInviteLink()).toHaveValue(value);
});

test("resending stops at three emails a day", async ({ page }) => {
  const conversation = await openConversation(page, "at-limit");
  const email = world.candidates["at-limit"].email;

  await conversation.getResendButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    `Invitation emailed to ${email} again.`,
  );
  await expect(waitForInviteLink(email)).resolves.toContain("/app/invite/");

  await conversation.getResendButton().click();
  await expect(
    conversation.getMembershipBanner().getByRole("alert"),
  ).toContainText("This invitation has been emailed 3 times today.");
});

test("revoking kills the link and offers a re-invite", async ({ page }) => {
  const conversation = await openConversation(page, "revokable");
  const path = world.invitePath("revokable");

  await conversation.getRevokeButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    "Revoke the invitation?",
  );
  await conversation.getRevokeButton().click();

  await expect(conversation.getMembershipBanner()).toContainText(
    "The invitation is no longer open.",
  );
  await expect(conversation.getInviteLink()).toBeHidden();
  await expect(conversation.getReinviteButton()).toBeVisible();

  await page.goto(path);
  await expect(new InvitePage(page).getInvalid()).toBeVisible();
});

test("changing the email sends a new link there and kills the old one", async ({
  page,
}) => {
  const conversation = await openConversation(page, "changeable");
  const oldPath = world.invitePath("changeable");
  const fixed = uniqueEmail("corrected");

  await conversation.changeEmail(`  ${fixed.toUpperCase()} `);
  await expect(conversation.getMembershipBanner()).toContainText(
    `Invitation sent to ${fixed}.`,
  );
  await expect(conversation.getCandidateEmail()).toHaveText(fixed);

  const link = await waitForInviteLink(fixed);
  await expect(conversation.getInviteLink()).toHaveValue(
    new RegExp(`${new URL(link).pathname}$`),
  );
  await page.goto(oldPath);
  await expect(new InvitePage(page).getInvalid()).toBeVisible();
});

test("changing to an address already in the book links to that candidate", async ({
  page,
}) => {
  const conversation = await openConversation(page, "clash");
  await conversation.changeEmail(world.candidates.copyable.email);

  const notice = conversation.getMembershipBanner().getByRole("alert");
  await expect(notice).toContainText(
    "You already have a candidate with this email.",
  );
  await notice.getByRole("link").click();
  await expect(page).toHaveURL(
    new RegExp(`/c/${world.candidateId("copyable")}$`),
  );
});

test("someone who declined can be re-invited", async ({ page }) => {
  const conversation = await openConversation(page, "declined");
  await expect(conversation.getMembershipBanner()).toContainText(
    "Declined Person declined your invitation on",
  );

  await conversation.getReinviteButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    "Invited · not joined yet.",
  );
  const link = await waitForInviteLink(world.candidates.declined.email);
  await expect(conversation.getInviteLink()).toHaveValue(
    new RegExp(`${new URL(link).pathname}$`),
  );
  await expect(
    new WorkspacePage(page).getCandidateRow("Declined Person"),
  ).toContainText("Invited");
});

test("someone who left is shown as gone, and can be re-invited", async ({
  page,
}) => {
  const conversation = await openConversation(page, "departed");
  await expect(conversation.getMembershipBanner()).toContainText(
    "Departed Person left on",
  );
  await expect(
    new WorkspacePage(page).getCandidateRow("Departed Person"),
  ).toContainText("Left");

  await conversation.getReinviteButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    "Invited · not joined yet.",
  );
});
