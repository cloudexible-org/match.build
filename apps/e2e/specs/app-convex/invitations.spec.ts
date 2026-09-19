import { type Browser, expect, type Page, test } from "@playwright/test";
import { signUp, signUpAsMatchmaker, uniqueEmail } from "../../accounts";
import { invitePath, waitForInviteLink } from "../../invite-emails";
import { HomePage } from "../../page-objects/app/home.page";
import {
  CandidateChatPage,
  InvitePage,
} from "../../page-objects/app/invite.page";
import {
  ConversationPage,
  OnboardPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";

/**
 * Invitations (prd/phase-1.md §3.2) against the seeded local backend: the
 * emailed link, the accept screen from the link and the home page, decline
 * and re-invite, and the matchmaker's resend / change email / revoke.
 *
 * Two people per test: the matchmaker in the test's own page, the candidate
 * in a second browser context (separate storage, so a separate session).
 * Every address is fresh, so tests don't share accounts or outbox mail.
 */

async function candidateContext(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return await context.newPage();
}

/** Onboards `email` from the matchmaker's workspace; ends in the conversation. */
async function onboard(page: Page, email: string, name?: string) {
  await new WorkspacePage(page).getOnboardLink().click();
  const form = new OnboardPage(page);
  await form.getEmailInput().fill(email);
  if (name) await form.getNameInput().fill(name);
  await form.getSubmitButton().click();
  await expect(new ConversationPage(page).getRoot()).toBeVisible();
}

test("an invited person accepts from their home page and joins", async ({
  page,
  browser,
  baseURL,
}) => {
  const { username } = await signUpAsMatchmaker(page, "inviter");
  const email = uniqueEmail("invitee");
  await onboard(page, email, "Jane Doe");
  const link = await waitForInviteLink(email);

  const candidate = await candidateContext(browser, baseURL);
  await signUp(candidate, "invitee", "Jane From Account", { email });
  const home = new HomePage(candidate);
  await home.getRow("invitations", "Maya Matches").click();

  const invite = new InvitePage(candidate);
  await expect(invite.getTitle()).toHaveText(
    "Maya Matches invited you to Matchmaker",
  );
  await expect(invite.getPrivacyNotice()).toContainText(
    "including if you later leave or delete your account",
  );
  await invite.getAcceptButton().click();

  await expect(candidate).toHaveURL(new RegExp(`/app/c/${username}$`));
  const chat = new CandidateChatPage(candidate);
  await expect(chat.getMatchmakerName()).toHaveText("Maya Matches");

  await home.goto();
  await expect(home.getInvitationsSection()).toBeHidden();
  await expect(
    home.getRow("candidateProfiles", "Maya Matches").getByRole("link"),
  ).toHaveAttribute("href", `/app/c/${username}`);

  // The link is used up.
  await candidate.goto(invitePath(link));
  await expect(invite.getInvalid()).toBeVisible();

  // The matchmaker's view: a member now, no banner, no marker.
  const conversation = new ConversationPage(page);
  await expect(conversation.getMembershipBanner()).toBeHidden();
  await expect(
    new WorkspacePage(page).getCandidateRow("Jane Doe"),
  ).not.toContainText("Invited");
  await candidate.context().close();
});

test("the link works for any account, and the matchmaker sees who accepted", async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpAsMatchmaker(page, "inviter2");
  const invited = uniqueEmail("typo");
  await onboard(page, invited);
  const link = await waitForInviteLink(invited);

  // Signed out: the link sends them to sign in, then back to the invite.
  const candidate = await candidateContext(browser, baseURL);
  await candidate.goto(invitePath(link));
  await expect(new SignInPage(candidate).getEmailForm()).toBeVisible();
  const { email: actual } = await signUp(candidate, "actual", "Sam Real", {
    goto: false,
  });
  const invite = new InvitePage(candidate);
  await invite.getAcceptButton().click();
  await expect(new CandidateChatPage(candidate).getRoot()).toBeVisible();

  const conversation = new ConversationPage(page);
  await expect(conversation.getCandidateName()).toHaveText("Sam Real");
  await expect(conversation.getCandidateEmail()).toHaveText(
    `Invited as ${invited} · Accepted as ${actual}`,
  );
  await candidate.context().close();
});

test("a declined invite can be re-sent, and the old link dies", async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpAsMatchmaker(page, "inviter3");
  const email = uniqueEmail("decliner");
  await onboard(page, email, "Dee Cline");
  const firstLink = await waitForInviteLink(email);

  const candidate = await candidateContext(browser, baseURL);
  await signUp(candidate, "decliner", "Dee", { email });
  await candidate.goto(invitePath(firstLink));
  const invite = new InvitePage(candidate);
  await invite.getDeclineButton().click();
  await expect(invite.getDeclined()).toBeVisible();

  const conversation = new ConversationPage(page);
  const workspace = new WorkspacePage(page);
  await expect(conversation.getMembershipBanner()).toContainText(
    "Dee Cline declined your invitation",
  );
  await expect(workspace.getCandidateRow("Dee Cline")).toContainText(
    "Declined",
  );

  await conversation.getReinviteButton().click();
  await expect(conversation.getMembershipBanner()).toContainText(
    "Invited · not joined yet.",
  );
  const secondLink = await waitForInviteLink(email, firstLink);
  await expect(conversation.getInviteLink()).toHaveValue(
    new RegExp(`${invitePath(secondLink)}$`),
  );

  await candidate.goto(invitePath(firstLink));
  await expect(invite.getInvalid()).toBeVisible();
  await candidate.goto(invitePath(secondLink));
  await expect(invite.getAcceptButton()).toBeVisible();
  await candidate.context().close();
});

test("the matchmaker resends, changes the email, and revokes", async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpAsMatchmaker(page, "inviter4");
  const typo = uniqueEmail("typo4");
  await onboard(page, typo, "Kim");
  const firstLink = await waitForInviteLink(typo);
  const conversation = new ConversationPage(page);
  const banner = conversation.getMembershipBanner();

  // Three emails a day, counting the first.
  await conversation.getResendButton().click();
  await expect(banner).toContainText(`Invitation emailed to ${typo} again.`);
  await conversation.getResendButton().click();
  await expect(banner).toContainText(`Invitation emailed to ${typo} again.`);
  await conversation.getResendButton().click();
  await expect(banner.getByRole("alert")).toContainText(
    "This invitation has been emailed 3 times today.",
  );

  // Changing the email is a new invite at the new address; the old link
  // dies. (Refused here: the send limit is per candidate, and it's spent.)
  const fixed = uniqueEmail("fixed4");
  await conversation.changeEmail(fixed);
  await expect(banner.getByRole("alert")).toContainText(
    "This invitation has been emailed 3 times today.",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  // Revoke kills the link at once, and offers Re-invite.
  await conversation.getRevokeButton().click();
  await conversation.getRevokeButton().click();
  await expect(banner).toContainText("The invitation is no longer open.");
  await expect(conversation.getReinviteButton()).toBeVisible();
  await expect(conversation.getInviteLink()).toBeHidden();

  const candidate = await candidateContext(browser, baseURL);
  await signUp(candidate, "someone4", "Someone");
  await candidate.goto(invitePath(firstLink));
  await expect(new InvitePage(candidate).getInvalid()).toBeVisible();
  await candidate.context().close();
});

test("changing the email sends a new link to the new address", async ({
  page,
}) => {
  await signUpAsMatchmaker(page, "inviter5");
  const typo = uniqueEmail("typo5");
  await onboard(page, typo, "Lee");
  const oldLink = await waitForInviteLink(typo);
  const conversation = new ConversationPage(page);

  const fixed = uniqueEmail("fixed5");
  await conversation.changeEmail(`  ${fixed.toUpperCase()} `);
  await expect(conversation.getMembershipBanner()).toContainText(
    `Invitation sent to ${fixed}.`,
  );
  await expect(conversation.getCandidateEmail()).toHaveText(fixed);
  const newLink = await waitForInviteLink(fixed);
  expect(newLink).not.toBe(oldLink);
  await expect(conversation.getInviteLink()).toHaveValue(
    new RegExp(`${invitePath(newLink)}$`),
  );
});

test("a matchmaker can't accept their own candidate's invite", async ({
  page,
}) => {
  await signUpAsMatchmaker(page, "inviter6");
  const email = uniqueEmail("own6");
  await onboard(page, email);
  const link = await waitForInviteLink(email);

  await page.goto(invitePath(link));
  const invite = new InvitePage(page);
  await expect(invite.getAlert()).toHaveText(
    "This invitation is from your own matchmaker profile.",
  );
  await expect(invite.getAcceptButton()).toBeHidden();
  await expect(invite.getDeclineButton()).toBeHidden();
});
