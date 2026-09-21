import { expect, test } from "@playwright/test";
import { signInToAdmin } from "@repo/harness/accounts";
import { AuditTrailPage } from "@repo/harness/page-objects/admin/audit-trail.page";
import { AdminLayout } from "@repo/harness/page-objects/admin/layout.page";
import { SEED_ADMINS, SEED_MATCHMAKERS, SEED_USERS } from "@repo/harness/seed";

/**
 * The platform audit trail against the seeded backend. The seed records one
 * `matchmaker.created` event per seeded profile; other specs add events of
 * their own as they run, so every assertion here is made under a filter that
 * only seeded data can satisfy.
 */

const admin = SEED_ADMINS.find((a) => a.slug === "admin-audit");
const profile = (slug: string) => {
  const found = SEED_MATCHMAKERS.find((m) => m.slug === slug);
  if (!found) throw new Error(`No seed matchmaker "${slug}"`);
  return found;
};

test("filters the whole platform's trail by matchmaker, action and account", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-audit'");
  await signInToAdmin(page, admin.email);

  // The admin home is the audit trail.
  const trail = new AuditTrailPage(page);
  await expect(trail.getHeading()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(new AdminLayout(page).getAccountEmail()).toHaveText(admin.email);

  // One matchmaker: just its creation.
  const own = profile("own");
  await trail.filterByMatchmaker(own.username);
  await expect(page).toHaveURL(/[?&]matchmaker=/);
  await expect(trail.getEvents()).toHaveCount(1);
  await expect(trail.getEvents().first()).toContainText(
    "Matchmaker profile created",
  );
  await expect(trail.getEvents().first()).toContainText(`@${own.username}`);
  await expect(trail.getCandidateSelect()).toBeEnabled();

  // Plus an action it never had: nothing.
  await trail.filterByAction("Note added");
  await expect(trail.getEmpty()).toBeVisible();

  // The filters live in the URL, so a reload keeps them.
  await page.reload();
  await expect(trail.getEmpty()).toBeVisible();
  await expect(trail.getActionSelect()).toHaveValue("note.created");

  // By the account that acted, which replaces the matchmaker filter.
  await trail.getClearFiltersButton().click();
  const owner = SEED_USERS.find((u) => u.slug === "owner-b");
  if (!owner) throw new Error("No seed user 'owner-b'");
  await trail.filterByAccount(owner.email);
  await expect(trail.getAccountFilter()).toContainText(owner.email);
  await expect(trail.getMatchmakerSelect()).toHaveValue("");
  await expect(trail.getEvents()).toHaveCount(1);
  await expect(trail.getEvents().first()).toContainText(
    `@${profile("joined").username}`,
  );
  await expect(trail.getEvents().first()).toContainText(
    `${owner.name} (matchmaker)`,
  );
});
