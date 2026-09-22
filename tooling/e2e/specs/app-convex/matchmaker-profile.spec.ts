import { expect, test } from "@playwright/test";
import { uniqueUsername } from "@repo/harness/accounts";
import { CandidateShellPage } from "@repo/harness/page-objects/app/candidate.page";
import { HomePage } from "@repo/harness/page-objects/app/home.page";
import {
  CreateMatchmakerPage,
  MatchmakerSettingsPage,
  WorkspacePage,
} from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";

/**
 * Creating a matchmaker profile, opening its workspace and editing it
 * (prd/phase-1.md §1, §4) — including their practice and their voice
 * (prd/phase-2.md §4.1C).
 *
 * A separate seeded account per test that writes: the creator has no profile
 * yet, the editor has one to change, the stranger owns nothing.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({
    users: [
      { key: "creator" }, // creates a profile in this file's first test
      { key: "editor" },
      { key: "stranger" },
      { key: "owner" },
      { key: "voiced" },
      { key: "practitioner" },
    ],
    matchmakers: [
      { key: "editable", ownerKey: "editor", displayName: "Editable Book" },
      { key: "taken", ownerKey: "owner" },
      {
        key: "practising",
        ownerKey: "practitioner",
        displayName: "Practising Book",
      },
      {
        key: "drafted",
        ownerKey: "voiced",
        // A draft the agent left and nobody has answered: the state no amount
        // of clicking could reach.
        voiceSuggestion: "Brisk, dry, never more than two sentences.",
      },
    ],
  });
});

test("a new account creates a profile, with the server's username rules", async ({
  page,
}) => {
  // An account with no profile lands on the candidate shell, which is where
  // "Become a matchmaker" lives.
  await signInAs(page, world.email("creator"));
  const home = new HomePage(page);
  await home.goto();
  await new CandidateShellPage(page).getCreateMatchmakerLink().click();

  const create = new CreateMatchmakerPage(page);
  await expect(create.getForm()).toBeVisible();

  // Checked as you type, once the field has been left.
  await create.getUsernameInput().fill("No.Reply");
  await create.getDisplayNameInput().focus();
  await expect(create.getError("That username isn't available.")).toBeVisible();
  await create.getUsernameInput().fill("jane..smith");
  await expect(
    create.getError("A username can't have two periods in a row."),
  ).toBeVisible();
  await create.getUsernameInput().fill("short");
  await expect(create.getError("Use at least 6 characters.")).toBeVisible();

  // Taken is only known to the server — here under a different dot placement.
  await create.create({
    username: world.username("taken").replaceAll(".", ""),
    displayName: "Maya",
  });
  await expect(create.getError("That username is taken.")).toBeVisible();

  const username = uniqueUsername();
  await create.create({
    username: `  ${username.toUpperCase()} `,
    displayName: "  Maya   Matches ",
  });

  const workspace = new WorkspacePage(page);
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));
  await expect(workspace.getName()).toHaveText("Maya Matches");
  await expect(workspace.getCandidates()).toContainText("No candidates yet");

  // The UI allows one profile per account: home now resolves straight to
  // the workspace they own, and so does the create page.
  await home.goto();
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));
  await create.goto();
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));
});

test("the workspace URL accepts any case or dot placement", async ({
  page,
}) => {
  await signInAs(page, world.email("editor"));
  const username = world.username("editable");
  const workspace = new WorkspacePage(page);

  await workspace.goto(username.replace(".", "").toUpperCase());
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}$`));
  await workspace.goto(`${username.toUpperCase()}/settings`);
  await expect(page).toHaveURL(new RegExp(`/app/mm/${username}/settings$`));
});

test("settings edit the display name", async ({ page }) => {
  await signInAs(page, world.email("editor"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("editable"));

  await expect(settings.getUsername()).toHaveText(world.username("editable"));
  await expect(settings.getDisplayNameInput()).toHaveValue("Editable Book");
  await settings.save({ displayName: "Renamed Book" });
  await expect(settings.getStatus()).toHaveText("Saved.");
  // The workspace header follows it through the subscription.
  await expect(new WorkspacePage(page).getName()).toHaveText("Renamed Book");

  // The change is still audited (`matchmakers.queries.profileHistory`, covered
  // by its own convex-test); settings no longer shows that log.
  await page.reload();
  await expect(settings.getDisplayNameInput()).toHaveValue("Renamed Book");
});

test("settings reject an empty display name before sending it", async ({
  page,
}) => {
  await signInAs(page, world.email("editor"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("editable"));
  await settings.save({ displayName: "   " });
  await expect(settings.getForm()).toContainText("Enter a display name.");
  await expect(settings.getStatus()).toHaveText("");
});

test("someone else's profile and a username nobody has look the same", async ({
  page,
}) => {
  await signInAs(page, world.email("stranger"));
  const workspace = new WorkspacePage(page);

  await workspace.goto(world.username("editable"));
  await expect(workspace.getNotFound()).toBeVisible();
  await expect(workspace.getRoot()).toBeHidden();

  await workspace.goto(`${world.username("taken")}/settings`);
  await expect(workspace.getNotFound()).toBeVisible();

  await workspace.goto("nobody.has.this.name");
  await expect(workspace.getNotFound()).toBeVisible();
});

test("their voice is theirs to write, and the assistant only ever drafts", async ({
  page,
}) => {
  await signInAs(page, world.email("voiced"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("drafted"));

  // The draft sits above the box, not in it: a suggestion that overwrote what
  // it is suggesting a change to would not be a suggestion.
  await expect(settings.getVoiceSuggestion()).toContainText("Brisk, dry");
  await expect(settings.getVoiceInput()).toHaveValue("");

  await settings.saveVoice("Warm but brief. I never say 'reach out'.");
  await expect(settings.getVoiceStatus()).toHaveText("Saved.");
  await page.reload();
  await expect(settings.getVoiceInput()).toHaveValue(
    "Warm but brief. I never say 'reach out'.",
  );
  await expect(settings.getVoiceStatus()).toHaveText("You added this");

  // Their own words stand until they take the draft themselves.
  await expect(settings.getVoiceSuggestion()).toBeVisible();
  await settings.acceptVoiceSuggestion();
  await expect(settings.getVoiceSuggestion()).toBeHidden();
  await expect(settings.getVoiceInput()).toHaveValue(
    "Brisk, dry, never more than two sentences.",
  );
  await expect(settings.getVoiceStatus()).toHaveText(
    "Suggested by the assistant, approved by you",
  );
});

test("their practice is theirs alone to write, field by field", async ({
  page,
}) => {
  await signInAs(page, world.email("practitioner"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("practising"));

  await expect(settings.getPracticeForm()).toBeVisible();
  // Nothing here is ever written by an agent — these are `matchmaker` policy,
  // which `agentWriteMode` refuses outright — so unlike the voice below there
  // is no suggestion to accept and no "Added by the assistant" to read.
  await expect(settings.getPracticeForm()).toContainText(
    "Only you write these",
  );

  // Save is dead until something changes, so a page nobody has touched cannot
  // write an empty value over a field.
  await expect(settings.getPracticeSave("whoYouWorkWith")).toBeDisabled();

  await settings.savePractice(
    "whoYouWorkWith",
    "British Indian families in London. Mostly 28–40.",
  );
  await expect(settings.getPracticeStatus("whoYouWorkWith")).toHaveText(
    "Saved.",
  );

  // Each field saves on its own, so a long edit to one cannot lose another.
  await settings.savePractice(
    "whatYouDont",
    "I never discuss anyone's income.",
  );
  await expect(settings.getPracticeStatus("whatYouDont")).toHaveText("Saved.");

  await page.reload();
  await expect(settings.getPracticeInput("whoYouWorkWith")).toHaveValue(
    "British Indian families in London. Mostly 28–40.",
  );
  await expect(settings.getPracticeInput("whatYouDont")).toHaveValue(
    "I never discuss anyone's income.",
  );
  // Untouched, and still empty — saving a sibling wrote nothing here.
  await expect(settings.getPracticeInput("howYouWork")).toHaveValue("");
});
