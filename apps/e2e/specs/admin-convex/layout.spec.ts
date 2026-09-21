import { expect, test } from "@playwright/test";
import { SEED_ADMINS } from "../../../../packages/api/convex/seed/e2e/fixture";
import { signInToAdmin } from "../../accounts";
import { AdminLayout } from "../../page-objects/admin/layout.page";

/**
 * The admin frame (`admin-layout.tsx`, `sidebar.tsx`): navigating from the
 * sidebar, collapsing it to its icons, and the collapse surviving a reload.
 *
 * Read-only — nothing here changes tenant data, so it shares the baseline
 * seed with the other admin specs.
 */

// One admin per spec file: a sign-in code is single use, so two files
// signing in as the same address race for it.
const admin = SEED_ADMINS.find((a) => a.slug === "admin-layout");

test("the sidebar navigates, collapses to icons, and remembers the choice", async ({
  page,
}) => {
  if (!admin) throw new Error("No seed admin 'admin-layout'");
  await signInToAdmin(page, admin.email);

  const layout = new AdminLayout(page);
  await expect(layout.getSidebar()).toHaveAttribute("data-collapsed", "false");
  await expect(layout.getNavLink("Erasure")).toBeVisible();

  await layout.getNavLink("Erasure").click();
  await expect(page).toHaveURL(/\/admin\/erasure$/);
  await expect(layout.getNavLink("Erasure")).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Collapsed: the labels go, the links stay — and stay reachable by name,
  // because the name is on the link rather than only in its text.
  await layout.getSidebarToggle().click();
  await expect(layout.getSidebar()).toHaveAttribute("data-collapsed", "true");
  await expect(layout.getSidebar()).not.toContainText("Audit trail");
  await expect(layout.getNavLink("Audit trail")).toBeVisible();
  await expect(layout.getSidebarToggle()).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await layout.getNavLink("Audit trail").click();
  await expect(page).toHaveURL(/\/admin\/audit$/);

  // The preference is this browser's, and outlives the page.
  await page.reload();
  await expect(layout.getSidebar()).toHaveAttribute("data-collapsed", "true");

  await layout.getSidebarToggle().click();
  await expect(layout.getSidebar()).toHaveAttribute("data-collapsed", "false");
  await expect(layout.getSidebar()).toContainText("Audit trail");
});
