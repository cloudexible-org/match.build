import { expect, test } from "@playwright/test";
import {
  SEED_ADMINS,
  SEED_CODE_TARGET,
  SEED_NOT_ADMIN,
} from "../../../../packages/api/convex/seed/e2e/fixture";
import { signInToAdmin } from "../../accounts";
import { AuditTrailPage } from "../../page-objects/admin/audit-trail.page";
import { AdminLayout } from "../../page-objects/admin/layout.page";
import {
  AdminSignInPage,
  NotAnAdminPage,
} from "../../page-objects/admin/sign-in.page";
import { SignInCodesPage } from "../../page-objects/admin/sign-in-codes.page";
import { HomePage } from "../../page-objects/app/home.page";
import { SignInPage } from "../../page-objects/app/sign-in.page";
import { latestSignInEmail } from "../../sign-in-codes";

/**
 * A platform admin issues a sign-in code for an ordinary account and signs in
 * to apps/app as it, in a second browser context. apps/app runs on its own
 * port in the suite, so that context is pointed at it explicitly.
 */

const admin = SEED_ADMINS.find((a) => a.slug === "admin-codes");

function appUrl(): string {
  const port = process.env.E2E_APP_PORT;
  if (!port) throw new Error("E2E_APP_PORT is unset — run via Playwright.");
  return `http://127.0.0.1:${port}`;
}

test("an admin issues a code, signs in to the app as the account, and the trail records it", async ({
  page,
  browser,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-codes'");
  const target = SEED_CODE_TARGET;
  await signInToAdmin(page, admin.email);
  await new AdminLayout(page).getNavLink("Sign-in codes").click();

  const codes = new SignInCodesPage(page);
  await expect(codes.getHeading()).toBeVisible();
  await codes.issueFor(target.email);
  await expect(codes.getIssuedCode()).toContainText(target.email);
  const code = await codes.readIssuedCode();

  // Nothing was emailed to the account's owner.
  expect(await latestSignInEmail(target.email)).toBeNull();

  const appContext = await browser.newContext({ baseURL: appUrl() });
  try {
    const appPage = await appContext.newPage();
    const signIn = new SignInPage(appPage);
    await signIn.goto();
    await signIn.useExistingCode(target.email);
    await signIn.enterCode(code);
    await expect(new HomePage(appPage).getAccountName()).toHaveText(
      target.name,
    );
  } finally {
    await appContext.close();
  }

  // The admin's own session is untouched, and the trail names both sides.
  const trail = new AuditTrailPage(page);
  await trail.goto();
  await trail.filterByAccount(admin.email);
  await trail.filterByAction("Sign-in code issued by admin");
  await expect(trail.getEvents()).toHaveCount(1);
  await expect(trail.getEvents().first()).toContainText(
    `${admin.name} (platform admin)`,
  );
  await expect(trail.getEvents().first()).toContainText(
    `Account: ${target.name}`,
  );
});

test("an account that isn't a platform admin is turned away", async ({
  page,
}) => {
  await signInToAdmin(page, SEED_NOT_ADMIN.email);
  const notAdmin = new NotAnAdminPage(page);
  await expect(notAdmin.get()).toContainText(SEED_NOT_ADMIN.email);

  // The pages behind the gate stay closed on a direct visit, too.
  await page.goto("/admin/sign-in-codes");
  await expect(notAdmin.get()).toBeVisible();

  await notAdmin.getSignOutButton().click();
  await expect(new AdminSignInPage(page).getEmailForm()).toBeVisible();
});
