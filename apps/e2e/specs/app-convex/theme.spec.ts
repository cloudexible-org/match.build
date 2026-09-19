import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "../../a11y";
import { HomePage } from "../../page-objects/app/home.page";
import { type Scenario, seedScenario } from "../../scenario";
import { signInAs } from "../../session";

/**
 * The theme control in the app header: light, dark, or whatever the device
 * says. The tokens in `@repo/ui/theme.css` follow the OS unless <html>
 * carries `.light` or `.dark`, so the classes are what these assert on.
 */

let world: Scenario;

test.beforeAll(async () => {
  world = await seedScenario({ users: [{ key: "maya", name: "Maya Maker" }] });
});

const htmlClass = (page: import("@playwright/test").Page) =>
  page.locator("html");

/** What the page actually renders — the class alone proves nothing. */
const background = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("cycles light, dark and system, and remembers the choice", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  const home = new HomePage(page);
  await home.goto();

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("data-theme-choice", "system");
  await expect(htmlClass(page)).not.toHaveClass(/light|dark/);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-theme-choice", "light");
  await expect(htmlClass(page)).toHaveClass(/light/);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-theme-choice", "dark");
  await expect(htmlClass(page)).toHaveClass(/dark/);

  // It survives a reload, and is applied before the app renders.
  await page.reload();
  await expect(htmlClass(page)).toHaveClass(/dark/);
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "data-theme-choice",
    "dark",
  );

  await page.getByTestId("theme-toggle").click();
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "data-theme-choice",
    "system",
  );
  await expect(htmlClass(page)).not.toHaveClass(/light|dark/);
});

test("says what it will do next, for a screen reader", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  await new HomePage(page).goto();

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute(
    "aria-label",
    "Theme: system. Switch to light.",
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-label",
    "Theme: light. Switch to dark.",
  );
});

test("dark actually repaints the page, and stays readable", async ({
  page,
}) => {
  await signInAs(page, world.email("maya"));
  await new HomePage(page).goto();
  const light = await background(page);

  await page.getByTestId("theme-toggle").click(); // light
  await page.getByTestId("theme-toggle").click(); // dark
  await expect(htmlClass(page)).toHaveClass(/dark/);

  // The tokens define dark values once and apply them by class as well as by
  // the OS; asserting the class alone would miss a palette that never landed.
  await expect.poll(() => background(page)).not.toBe(light);

  // Buttons animate their colours, and a frame mid-transition fails the
  // contrast check while landing well clear of it. Scan the settled page.
  await page.waitForTimeout(500);
  await expectNoA11yViolations(page);
});

test("a dark choice holds across the app's pages", async ({ page }) => {
  await signInAs(page, world.email("maya"));
  const home = new HomePage(page);
  await home.goto();
  await page.getByTestId("theme-toggle").click();
  await page.getByTestId("theme-toggle").click();
  await expect(htmlClass(page)).toHaveClass(/dark/);

  await page.goto("/app/mm/new");
  await expect(htmlClass(page)).toHaveClass(/dark/);
  await home.goto();
  await expect(htmlClass(page)).toHaveClass(/dark/);
});
