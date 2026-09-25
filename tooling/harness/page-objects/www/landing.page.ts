import type { Locator, Page } from "@playwright/test";

/**
 * The `apps/www` landing page — the Next.js marketing site served at `/`.
 *
 * Locators are verified against the DOM rendered by `apps/www/app/page.tsx` and
 * the sections under `apps/www/components/landing/`. Per
 * `docs/e2e-architecture.md` §4, an unexecuted page object states an intention,
 * not the app: keep these in sync by running the suite, not by reading it.
 *
 * Getters are synchronous — a Playwright locator is a lazy selector, not a
 * query, so there is nothing to await until it is acted on or asserted against.
 * The scroll helpers are the exception: they drive the page and settle it.
 */
export class LandingPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
    // The hero's staggered mount reveal runs ~1.2s. Waiting for it here keeps
    // every spec from racing the entrance animation.
    await this.getHeroContent().waitFor({ state: "visible" });
  }

  // --- Chrome -------------------------------------------------------------

  getNav() {
    return this.page.getByTestId("site-nav");
  }

  getBrandLink() {
    return this.getNav().getByRole("link", { name: "match.build" });
  }

  /**
   * Sign-in lives in the Vite app; the marketing site only links to it.
   *
   * This is the bar's copy, which is `md`-and-up. Below that the link lives in
   * `MobileNav` — see `getMobileNavItem("Sign in / Sign up")`. Role queries skip
   * `display: none`, so exactly one of the two is ever matchable, and a spec
   * that asks for the wrong one fails rather than quietly asserting on the
   * other.
   */
  getSignInLink() {
    return this.getNav().getByRole("link", {
      name: "Sign in / Sign up",
      exact: true,
    });
  }

  // --- Mobile nav ---------------------------------------------------------

  /** The hamburger. `md:hidden`, so it is absent from a desktop run. */
  getMobileNavTrigger() {
    return this.page.getByRole("button", { name: "Menu", exact: true });
  }

  /**
   * The popup. Base UI portals it to `<body>`, so it is NOT inside
   * `getNav()` — scope from the page, not the nav.
   */
  getMobileNav() {
    return this.page.getByTestId("mobile-nav");
  }

  /**
   * One row. Every row is `role="menuitem"`, links included: inside a menu
   * that is the correct ARIA pattern, and Base UI sets it. The links are
   * still real `<a href>`s, so assert the href, not the role.
   */
  getMobileNavItem(label: string) {
    return this.getMobileNav().getByRole("menuitem", {
      name: label,
      exact: true,
    });
  }

  async openMobileNav() {
    await this.getMobileNavTrigger().click();
    await this.getMobileNav().waitFor({ state: "visible" });
  }

  getNavWaitlistLink() {
    return this.getNav().getByRole("link", {
      name: "Join the waitlist",
      exact: true,
    });
  }

  getThemeToggle() {
    return this.page.getByRole("button", { name: "Toggle theme" });
  }

  /**
   * The reading-progress bar. It is driven by a spring on `scrollYProgress`,
   * so assert on its `scaleX` rather than on a fixed value.
   */
  getReadingProgress() {
    return this.page.getByTestId("reading-progress");
  }

  // --- Hero ---------------------------------------------------------------

  getHeading() {
    return this.page.getByRole("heading", {
      name: "Carry a bigger book. Keep the curation.",
      level: 1,
    });
  }

  getTagline() {
    return this.page.getByTestId("hero-tagline");
  }

  /** The hero's primary CTA — a `ButtonLink`, so it must stay a link. */
  getHeroWaitlistLink() {
    return this.getHeroContent().getByRole("link", {
      name: "Join the waitlist",
      exact: true,
    });
  }

  getHeroHowItWorksLink() {
    return this.getHeroContent().getByRole("link", {
      name: "See how it works",
      exact: true,
    });
  }

  /** The illustrative product still. Decorative; described by its caption. */
  getConversationMock() {
    return this.page.getByTestId("conversation-mock");
  }

  /**
   * The drafted reply inside the still. It sits above the composer and is
   * never a message bubble — the whole point of the card in the product.
   */
  getMockSuggestion() {
    return this.page.getByTestId("mock-suggestion");
  }

  /** Every link that opens a new tab, by DOM attribute. */
  getNewTabLinks() {
    return this.page.locator('a[target="_blank"]');
  }

  /** Links whose *accessible name* says they open a new tab. */
  getAnnouncedNewTabLinks() {
    return this.page.getByRole("link", { name: /\(opens in a new tab\)$/ });
  }

  /** The scroll-linked hero block — carries the `y` drift transform. */
  getHeroContent() {
    return this.page.getByTestId("hero-content");
  }

  // --- Sections -----------------------------------------------------------

  getSteps() {
    return this.page.getByTestId("step");
  }

  getFeatureCards() {
    return this.page.getByTestId("feature-card");
  }

  /**
   * The roadmap callout under the feature grid. It names what is *not* built
   * yet; anything shipped belongs in `getFeatureCards()` instead.
   */
  getComingNext() {
    return this.page.getByTestId("coming-next");
  }

  getReveals() {
    return this.page.getByTestId("reveal");
  }

  getSection(
    name:
      | "problem"
      | "how-it-works"
      | "principles"
      | "privacy"
      | "faq"
      | "waitlist",
  ): Locator {
    return this.page.getByTestId(name);
  }

  getFooterLink() {
    return this.page.getByRole("link", { name: /^Cloudexible/ });
  }

  // --- FAQ ----------------------------------------------------------------

  getFaqItems() {
    return this.page.getByTestId("faq-item");
  }

  /** An accordion trigger — a real button carrying `aria-expanded`. */
  getFaqQuestion(question: string) {
    return this.getSection("faq").getByRole("button", { name: question });
  }

  // --- Waitlist -----------------------------------------------------------

  getWaitlistForm() {
    return this.page.getByTestId("waitlist-form");
  }

  getWaitlistField(label: "Email" | "Name" | "Instagram") {
    return this.getWaitlistForm().getByLabel(label);
  }

  getWaitlistSubmit() {
    return this.getWaitlistForm().getByRole("button", {
      name: "Join the waitlist",
    });
  }

  getWaitlistSuccess() {
    return this.page.getByTestId("waitlist-success");
  }

  // --- Scrolling ----------------------------------------------------------

  /**
   * Scroll with real wheel events. Lenis (root mode) intercepts them and eases
   * the document scroll, so a `window.scrollTo` would fight it and synthetic
   * `WheelEvent`s are ignored as untrusted — only `mouse.wheel` moves the page.
   */
  async wheel(ticks: number) {
    for (let i = 0; i < ticks; i++) {
      await this.page.mouse.wheel(0, 120);
      await this.page.waitForTimeout(30);
    }
    await this.settle();
  }

  /** Wait for Lenis's easing to stop moving the page. */
  async settle() {
    await this.page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const start = window.scrollY;
          setTimeout(() => resolve(Math.abs(window.scrollY - start) < 1), 250);
        }),
      undefined,
      { timeout: 15_000 },
    );
  }

  scrollY() {
    return this.page.evaluate(() => Math.round(window.scrollY));
  }

  /** True when Lenis mounted — it is skipped entirely under reduced motion. */
  hasLenis() {
    return this.page.evaluate(() =>
      document.documentElement.classList.contains("lenis"),
    );
  }

  themeClass() {
    return this.page.evaluate(() =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
  }
}
