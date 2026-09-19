import { expect, test } from "@playwright/test";
import { SignInPage } from "../../page-objects/app/sign-in.page";

/**
 * The `apps/app` shell with no backend.
 *
 * In CI `VITE_CONVEX_URL` is a placeholder that never connects, so these assert
 * only what renders and validates client-side: a signed-out visitor is sent to
 * sign-in, and a malformed email is caught before any request is made.
 */

test("a signed-out visitor is sent to sign-in, remembering where they were headed", async ({
  page,
}) => {
  await page.goto("/app/c/some.matchmaker");

  const signIn = new SignInPage(page);
  await expect(signIn.getEmailForm()).toBeVisible();
  await expect(page).toHaveURL(/\/app\/sign-in\?next=%2Fc%2Fsome\.matchmaker$/);
});

test("home redirects to a plain sign-in URL", async ({ page }) => {
  await page.goto("/app/");
  await expect(new SignInPage(page).getEmailForm()).toBeVisible();
  await expect(page).toHaveURL(/\/app\/sign-in$/);
});

test("rejects a malformed email without leaving the email step", async ({
  page,
}) => {
  const signIn = new SignInPage(page);
  await signIn.goto();

  await signIn.getSendCodeButton().click();
  await expect(signIn.getError("Enter your email address.")).toBeVisible();

  await signIn.requestCode("not-an-email");
  await expect(signIn.getError("Enter a valid email address.")).toBeVisible();
  await expect(signIn.getCodeForm()).toBeHidden();
});
