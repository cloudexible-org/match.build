import { expect, test } from "@playwright/test";
import { signUpAsMatchmaker } from "../../accounts";
import {
  ConversationPage,
  OnboardPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";

/**
 * Onboarding a candidate (prd/phase-1.md §3.1) against the seeded local
 * backend: the form, the new conversation with its private imported history,
 * the copyable invite link, and the workspace list.
 *
 * Parallel-safe: each test signs up its own matchmaker, so its book starts
 * empty.
 */

test("a matchmaker onboards a candidate and lands in their conversation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUpAsMatchmaker(page, "onboard");
  const workspace = new WorkspacePage(page);
  await workspace.getOnboardLink().click();

  const onboard = new OnboardPage(page);
  await expect(onboard.getForm()).toBeVisible();

  // The server's rules, checked before anything is sent.
  await onboard.getSubmitButton().click();
  await expect(onboard.getError("Enter their email address.")).toBeVisible();
  await onboard.addHandle("WhatsApp", "07700 900123");
  await onboard.getSubmitButton().click();
  await expect(
    onboard.getError(/Enter the number with its country code/),
  ).toBeVisible();
  await onboard
    .getHandleRows()
    .last()
    .getByRole("textbox")
    .fill("+44 7700 900123");
  await onboard.addHandle("Instagram", "@jane.doe");

  await onboard.getEmailInput().fill("  Jane.Doe@Example.test ");
  await onboard.getNameInput().fill(" Jane   Doe ");
  await onboard
    .getHistoryInput()
    .fill("Jane: Hi! A friend sent me your way.\nMe: Lovely to hear from you.");
  await onboard.getSubmitButton().click();

  const conversation = new ConversationPage(page);
  await expect(page).toHaveURL(/\/app\/mm\/[^/]+\/c\/[^/]+$/);
  const url = page.url();
  await expect(conversation.getCandidateName()).toHaveText("Jane Doe");

  // The pasted history opens the thread, private to the matchmaker.
  const history = conversation.getMessages();
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText("Only visible to you");
  await expect(history.first()).toContainText(
    "Jane: Hi! A friend sent me your way.\nMe: Lovely to hear from you.",
  );

  // The invite link is on this origin, and the same one after a reload.
  await expect(conversation.getInviteBanner()).toContainText(
    "Invited · not joined yet.",
  );
  await expect(conversation.getInviteBanner()).toContainText(
    "jane.doe@example.test",
  );
  const link = conversation.getInviteLink();
  await expect(link).toHaveValue(/\/app\/invite\/[A-Za-z0-9_-]{43}$/);
  const linkValue = await link.inputValue();
  await conversation.getCopyInviteLinkButton().click();
  await expect(conversation.getCopyInviteLinkButton()).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    linkValue,
  );
  await page.reload();
  await expect(conversation.getInviteLink()).toHaveValue(linkValue);

  // The candidate is in the list, marked as invited, and searchable.
  const row = workspace.getCandidateRow("Jane Doe");
  await expect(row).toContainText("jane.doe@example.test");
  await expect(row).toContainText("Invited");
  await workspace.getSearchInput().fill("nobody");
  await expect(workspace.getCandidates()).toContainText("No matches");
  await workspace.getSearchInput().fill("JANE.DOE");
  await expect(row).toBeVisible();
  await workspace.getStatusFilter("Archived").click();
  await expect(workspace.getCandidates()).toContainText("No matches");
  await workspace.getSearchInput().fill("");
  await expect(workspace.getCandidates()).toContainText(
    "No archived candidates",
  );
  await workspace.getStatusFilter("Active").click();

  // The same email again, in any case, links to the existing candidate.
  await workspace.getOnboardLink().click();
  await onboard.getEmailInput().fill("JANE.DOE@example.test");
  await onboard.getSubmitButton().click();
  await expect(onboard.getDuplicateNotice()).toContainText(
    "You already have a candidate with this email.",
  );
  await onboard.getDuplicateNotice().getByRole("link").click();
  await expect(page).toHaveURL(url);
});

test("on a phone, a conversation replaces the list and leads back to it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 800 });
  await signUpAsMatchmaker(page, "onboardmobile");
  const workspace = new WorkspacePage(page);
  await workspace.getOnboardLink().click();
  const onboard = new OnboardPage(page);
  await onboard.getEmailInput().fill("sam@example.test");
  await onboard.getSubmitButton().click();

  const conversation = new ConversationPage(page);
  await expect(conversation.getCandidateName()).toHaveText("sam@example.test");
  await expect(conversation.getMessages()).toHaveCount(0);
  await expect(workspace.getCandidates()).toBeHidden();

  await conversation.getBackLink().click();
  await expect(workspace.getCandidates()).toBeVisible();
  await expect(workspace.getConversation()).toBeHidden();
  await workspace.getCandidateRow("sam@example.test").click();
  await expect(conversation.getCandidateName()).toBeVisible();
});

test("an unknown or malformed conversation id shows not found", async ({
  page,
}) => {
  const { username } = await signUpAsMatchmaker(page, "onboardmissing");
  const conversation = new ConversationPage(page);
  await page.goto(`/app/mm/${username}/c/not-an-id`);
  await expect(conversation.getNotFound()).toBeVisible();
});
