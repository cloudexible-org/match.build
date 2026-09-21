import { expect, test } from "@playwright/test";
import { AdminSignInPage } from "@repo/harness/page-objects/admin/sign-in.page";

/**
 * The `apps/admin` shell with no backend: every page sends a signed-out
 * visitor to sign-in, and the email is checked before any request.
 */

test("a signed-out visitor is sent to sign-in, remembering the page", async ({
  page,
}) => {
  await page.goto("/admin/sign-in-codes");
  await expect(new AdminSignInPage(page).getEmailForm()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/sign-in\?next=%2Fsign-in-codes$/);
});

test("the admin home redirects to a plain sign-in URL", async ({ page }) => {
  await page.goto("/admin/");
  await expect(new AdminSignInPage(page).getEmailForm()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

test("rejects a malformed email without leaving the email step", async ({
  page,
}) => {
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.requestCode("not-an-email");
  await expect(signIn.getError("Enter a valid email address.")).toBeVisible();
  await expect(signIn.getCodeForm()).toBeHidden();
});

test("is kept out of search engines", async ({ page }) => {
  await page.goto("/admin/sign-in");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});
