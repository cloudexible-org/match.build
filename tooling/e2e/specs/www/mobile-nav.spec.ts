import { expect, test } from "@playwright/test";
import { LandingPage } from "@repo/harness/page-objects/www/landing.page";

/**
 * The marketing nav on a phone.
 *
 * Its own file rather than more tests in `landing.spec.ts`, because the
 * viewport is a project-level `use` and this is the only file in `specs/www`
 * that wants a phone-sized one — and because `landing.spec.ts` is already past
 * the ~10-test mark `docs/e2e-architecture.md` §8 sets for a file.
 *
 * What it is here to prevent: `Sign in` was `hidden sm:inline-flex`, so on a
 * 375px screen the marketing site had no route into the app at all. That is
 * invisible to a desktop run — every existing www spec passed the whole time —
 * so the coverage has to be a viewport, not another assertion.
 */
test.use({ viewport: { width: 375, height: 812 } });

test.describe("mobile nav", () => {
  test("the header carries the brand, the CTA and a way in", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.getBrandLink()).toBeVisible();
    await expect(landing.getNavWaitlistLink()).toBeVisible();
    await expect(landing.getMobileNavTrigger()).toBeVisible();

    // The bar's own copies are `md`-and-up, and a role query skips
    // `display: none` — so on a phone they are not merely small, they are gone.
    await expect(landing.getSignInLink()).toHaveCount(0);
    await expect(landing.getThemeToggle()).toHaveCount(0);

    // ...and the header fits. It did not have to: before the menu the bar held
    // one control more than 375px has room for.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  /** The defect, stated as a test: a phone can reach the app. */
  test("sign in is reachable from the menu", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.openMobileNav();

    const signIn = landing.getMobileNavItem("Sign in");
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/app/");
    // A real anchor, so middle-click and open-in-new-tab work. `role` is
    // `menuitem` because it is in a menu; the tag is what makes it a link.
    await expect(signIn).toHaveJSProperty("tagName", "A");
  });

  test("the menu carries every section link the desktop bar shows", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.openMobileNav();

    for (const [label, href] of [
      ["How it works", "#how-it-works"],
      ["Features", "#features"],
      ["Privacy", "#privacy"],
      ["FAQ", "#faq"],
    ] as const) {
      await expect(landing.getMobileNavItem(label)).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  test("picking a section closes the menu and goes there", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.openMobileNav();
    await landing.getMobileNavItem("FAQ").click();

    // `closeOnClick` — a menu still standing over the section you just asked
    // for is a menu you have to dismiss twice.
    await expect(landing.getMobileNav()).toHaveCount(0);
    await expect(landing.getSection("faq")).toBeInViewport();
  });

  test("the theme row switches the theme and stays open", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const before = await landing.themeClass();
    await landing.openMobileNav();
    await landing
      .getMobileNavItem(before === "dark" ? "Light theme" : "Dark theme")
      .click();

    await expect.poll(() => landing.themeClass()).not.toBe(before);
    // `closeOnClick={false}`: the page changing colour is the feedback, and
    // it is worth seeing without the menu vanishing from under the thumb.
    await expect(landing.getMobileNav()).toBeVisible();
  });

  /**
   * Base UI brings this; the test is here because a hand-rolled replacement
   * would not, and the next person to reach for `useState` and a `<div>`
   * should find out from the suite.
   */
  test("the menu works from the keyboard", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const trigger = landing.getMobileNavTrigger();
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    await expect(landing.getMobileNav()).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Opening with a key moves focus straight into the list, as the ARIA menu
    // pattern asks — a menu that opened but left focus behind would need a
    // second Tab to be usable at all.
    await expect(landing.getMobileNavItem("How it works")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(landing.getMobileNavItem("Features")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(landing.getMobileNav()).toHaveCount(0);
    // Focus comes back, rather than being dropped on `<body>` — where the next
    // Tab would start the page over from the top.
    await expect(trigger).toBeFocused();
  });
});

/**
 * The 320px class of screen — an iPhone SE 1st gen, a small old Android. The
 * bar never fitted there: before the menu it overflowed by 14px, and swapping
 * the theme toggle for a menu button was width-neutral, so the fix is the
 * `min-[360px]` tightening in `site-nav.tsx` rather than the menu itself.
 *
 * A horizontal overflow is worth a test of its own because it is silent: the
 * page just scrolls sideways, nothing errors, and every other assertion in
 * this file still passes.
 */
test.describe("the narrowest phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("the header fits, with everything still in it", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.getBrandLink()).toBeVisible();
    await expect(landing.getNavWaitlistLink()).toBeVisible();
    await expect(landing.getMobileNavTrigger()).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

/**
 * The other side of the breakpoint. `md` is the single mobile/desktop line in
 * this nav — before this change `Sign in` flipped at `sm` and the section
 * links at `md`, which left 640–767px showing a sign-in link and no sections.
 */
test.describe("the desktop bar", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test("shows everything inline and no menu button", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.getSignInLink()).toBeVisible();
    await expect(landing.getThemeToggle()).toBeVisible();
    await expect(landing.getMobileNavTrigger()).toHaveCount(0);
  });
});
