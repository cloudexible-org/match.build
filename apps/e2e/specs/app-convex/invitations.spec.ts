import { expect, test } from "@playwright/test";
import { signUp } from "../../accounts";
import {
  CandidateChatPage,
  CandidateShellPage,
} from "../../page-objects/app/candidate.page";
import { InvitePage } from "../../page-objects/app/invite.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Answering an invitation (prd/phase-1.md §3.2): the accept screen from a
 * link and from the home page, accepting, declining, and every reason an
 * invite can't be answered.
 *
 * One seeded invite per test, so no test can answer another's.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "maya", name: "Maya Maker" },
      { key: "jane", name: "Jane Invitee" },
      { key: "sam", name: "Sam Other" },
      { key: "kim", name: "Kim Decliner" },
      { key: "member", name: "Ali Member" },
      // Never joins anything: the outsider checks refuse the right way.
      { key: "outsider", name: "Otto Outsider" },
    ],
    matchmakers: [
      { key: "book", ownerKey: "maya", displayName: "Maya's Book" },
    ],
    candidates: [
      // One per test, so answering one can't affect another.
      { key: "for-home", matchmakerKey: "book", userKey: "jane" },
      { key: "for-link", matchmakerKey: "book" },
      { key: "for-decline", matchmakerKey: "book", userKey: "kim" },
      { key: "for-signup", matchmakerKey: "book" },
      { key: "expired", matchmakerKey: "book", invite: "expired" },
      { key: "for-own", matchmakerKey: "book" },
      { key: "for-member", matchmakerKey: "book" },
      {
        key: "already",
        matchmakerKey: "book",
        userKey: "member",
        membership: "joined",
      },
    ],
  });
});

test("an invited person accepts from their own shell and joins", async ({
  page,
}) => {
  await signInAs(page, world.email("jane"));
  const shell = new CandidateShellPage(page);
  await shell.goto();
  await shell.getInvitation(world.displayName("book")).click();

  const invite = new InvitePage(page);
  await expect(invite.getTitle()).toHaveText(
    `${world.displayName("book")} invited you to match.build`,
  );
  await expect(invite.getPrivacyNotice()).toContainText(
    "including if you later leave or delete your account",
  );
  await invite.getAcceptButton().click();

  await expect(page).toHaveURL(`/app/c#${world.username("book")}`);
  await expect(new CandidateChatPage(page).getMatchmakerName()).toHaveText(
    world.displayName("book"),
  );

  // The invitation is gone from the first column, and the matchmaker is
  // listed there instead.
  await expect(shell.getInvitationsSection()).toBeHidden();
  await expect(shell.getMatchmakerRow(world.displayName("book"))).toBeVisible();
});

test("the link works for an account it wasn't addressed to, and is single use", async ({
  page,
}) => {
  await signInAs(page, world.email("sam"));
  const invite = new InvitePage(page);
  await page.goto(world.invitePath("for-link"));
  await invite.getAcceptButton().click();
  await expect(new CandidateChatPage(page).getRoot()).toBeVisible();

  await page.goto(world.invitePath("for-link"));
  await expect(invite.getInvalid()).toBeVisible();
});

test("declining keeps the record and says so", async ({ page }) => {
  await signInAs(page, world.email("kim"));
  const invite = new InvitePage(page);
  await page.goto(world.invitePath("for-decline"));
  await invite.getDeclineButton().click();

  await expect(invite.getDeclined()).toBeVisible();
  await page.goto(world.invitePath("for-decline"));
  await expect(invite.getInvalid()).toBeVisible();

  // Declining doesn't join them to anything.
  const shell = new CandidateShellPage(page);
  await shell.goto();
  await expect(shell.getMatchmakerList()).not.toContainText(
    world.displayName("book"),
  );
});

test("a signed-out visitor signs up through the link and lands back on it", async ({
  page,
}) => {
  await page.goto(world.invitePath("for-signup"));
  await expect(new SignInPage(page).getEmailForm()).toBeVisible();

  await signUp(page, "invitesignup", "Newcomer Person", { goto: false });
  const invite = new InvitePage(page);
  await expect(invite.getAcceptButton()).toBeVisible();
  await invite.getAcceptButton().click();
  await expect(new CandidateChatPage(page).getRoot()).toBeVisible();
});

test("an expired link can't be answered", async ({ page }) => {
  await signInAs(page, world.email("outsider"));
  await page.goto(world.invitePath("expired"));
  await expect(new InvitePage(page).getInvalid()).toBeVisible();
});

test("the matchmaker can't accept or decline their own candidate's invite", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const invite = new InvitePage(page);
  await page.goto(world.invitePath("for-own"));

  await expect(invite.getAlert()).toHaveText(
    "This invitation is from your own matchmaker profile.",
  );
  await expect(invite.getAcceptButton()).toBeHidden();
  await expect(invite.getDeclineButton()).toBeHidden();
});

test("an existing member is told they're already in the book", async ({
  page,
}) => {
  await signInAs(page, world.email("member"));
  const invite = new InvitePage(page);
  await page.goto(world.invitePath("for-member"));

  await expect(invite.getAlert()).toHaveText(
    "You're already a member of this matchmaker.",
  );
  await expect(invite.getAcceptButton()).toBeHidden();
});

test("a candidate URL for a matchmaker you haven't joined is not found", async ({
  page,
}) => {
  await signInAs(page, world.email("outsider"));
  await page.goto(`/app/c#${world.username("book")}`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
