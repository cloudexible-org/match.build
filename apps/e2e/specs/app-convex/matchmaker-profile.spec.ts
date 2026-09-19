import { expect, test } from "@playwright/test";
import { uniqueUsername } from "../../accounts";
import { HomePage } from "../../page-objects/app/home.page";
import {
  CreateMatchmakerPage,
  MatchmakerSettingsPage,
  WorkspacePage,
} from "../../page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * Creating a matchmaker profile, opening its workspace and editing it
 * (prd/phase-1.md §1, §4).
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
    ],
    matchmakers: [
      { key: "editable", ownerKey: "editor", displayName: "Editable Book" },
      { key: "taken", ownerKey: "owner" },
    ],
  });
});

test("a new account creates a profile, with the server's username rules", async ({
  page,
}) => {
  await signInAs(page, world.email("creator"));
  const home = new HomePage(page);
  await home.goto();
  await home.getCreateMatchmakerLink().click();

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

  // The UI allows one profile per account: the button goes, and the create
  // page sends them to the workspace they already have.
  await home.goto();
  await expect(home.getCreateMatchmakerLink()).toBeHidden();
  await expect(home.getRow("matchmakerProfiles", "Maya Matches")).toContainText(
    `@${username}`,
  );
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

test("settings edit the display and business names, and record the history", async ({
  page,
}) => {
  await signInAs(page, world.email("editor"));
  const settings = new MatchmakerSettingsPage(page);
  await settings.goto(world.username("editable"));

  await expect(settings.getUsername()).toHaveText(world.username("editable"));
  await expect(settings.getDisplayNameInput()).toHaveValue("Editable Book");
  await settings.save({
    displayName: "Renamed Book",
    businessName: "Renamed & Co",
  });
  await expect(settings.getStatus()).toHaveText("Saved.");
  await expect(new WorkspacePage(page).getName()).toHaveText("Renamed Book");

  const history = settings.getHistoryEntries();
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText(
    "Changed display name from “Editable Book” to “Renamed Book”",
  );
  await expect(history.first()).toContainText(
    "Set business name to “Renamed & Co”",
  );
  await expect(history.last()).toContainText("Created the profile");

  // A blank business name removes it, and that is recorded too.
  await settings.save({ businessName: "" });
  await expect(settings.getStatus()).toHaveText("Saved.");
  await expect(settings.getHistoryEntries().first()).toContainText(
    "Removed business name “Renamed & Co”",
  );
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
