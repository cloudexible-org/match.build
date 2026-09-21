import { expect, test } from "@playwright/test";
import { LandingPage } from "@repo/harness/page-objects/www/landing.page";

/**
 * Coverage for the `apps/www` marketing site.
 *
 * Asserts only on statically-rendered chrome, client-side validation and
 * animation state — never on backend data. `NEXT_PUBLIC_CONVEX_URL` is a
 * placeholder in CI that never connects, so nothing here may depend on it.
 */
test.describe("landing chrome", () => {
  test("renders the hero", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.getHeading()).toBeVisible();
    await expect(landing.getTagline()).toBeVisible();
    await expect(landing.getHeroWaitlistLink()).toHaveAttribute(
      "href",
      "#waitlist",
    );
    await expect(landing.getHeroHowItWorksLink()).toHaveAttribute(
      "href",
      "#how-it-works",
    );
  });

  /**
   * The product still is an illustration: its fake buttons ("Send" on both the
   * composer and the drafted reply) must not reach assistive technology as
   * controls, and its figcaption is the single description of it.
   */
  test("the product mock is described once, not read out", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const mock = landing.getConversationMock();
    await expect(mock).toBeVisible();
    await expect(mock.locator("figcaption")).toContainText("invitation");
    // The imported DM history is the matchmaker's alone, and says so.
    await expect(mock.getByText(/Only visible to you/)).toBeVisible();
    // The drafted reply sits above the composer and is never a bubble: a
    // suggestion in the message list would read as something the candidate
    // said (prd/phase-2.md §2).
    const suggestion = landing.getMockSuggestion();
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText("Suggested reply");
    await expect(mock.locator("figcaption")).toContainText("suggested reply");

    // Role queries honour `aria-hidden`, so the mock's pretend controls are
    // absent from the accessibility tree even though they render. There are
    // two "Send"s now — the composer's and the draft's — and neither is a
    // control.
    await expect(mock.getByText("Send", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  });

  /**
   * Button-styled links must stay links. `components/ui/button` exposes
   * `ButtonLink` (a plain `<a>` carrying `buttonVariants`) precisely because
   * `<Button render={<a />} />` sets `nativeButton={false}`, and Base UI then
   * stamps `role="button"` over the anchor's implicit link role — so assistive
   * technology announces a navigating link as a button. Base UI's own docs say
   * links "should not be rendered as buttons through the `render` prop".
   */
  test("button-styled links keep link semantics", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    for (const [link, href] of [
      [landing.getHeroWaitlistLink(), "#waitlist"],
      [landing.getHeroHowItWorksLink(), "#how-it-works"],
      [landing.getNavWaitlistLink(), "#waitlist"],
      [landing.getSignInLink(), "/app/"],
    ] as const) {
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", href);
      // A link, never a button — and never both.
      await expect(link).not.toHaveAttribute("role", "button");
    }
  });

  /**
   * Every `target="_blank"` link must announce itself. Sighted users see a new
   * tab appear; screen reader users get no signal at all, and Back no longer
   * returns them where they were (WCAG 3.2.5).
   *
   * Asserted as an invariant over the whole page rather than link by link, so a
   * new external link added later cannot quietly skip the hint.
   */
  test("every link that opens a new tab announces it", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const total = await landing.getNewTabLinks().count();
    expect(total).toBeGreaterThan(0);
    await expect(landing.getAnnouncedNewTabLinks()).toHaveCount(total);
  });

  test("renders the sticky nav and footer", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.getNav()).toBeVisible();
    await expect(landing.getBrandLink()).toBeVisible();
    await expect(landing.getFooterLink()).toHaveAttribute(
      "href",
      "https://cloudexible.com",
    );
  });

  test("renders every landing section", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    for (const name of [
      "problem",
      "how-it-works",
      "principles",
      "privacy",
      "faq",
      "waitlist",
    ] as const) {
      await expect(landing.getSection(name)).toBeAttached();
    }
    await expect(landing.getSteps()).toHaveCount(4);
    await expect(landing.getFeatureCards()).toHaveCount(9);
    await expect(landing.getFaqItems()).toHaveCount(8);
  });

  /**
   * The onboarding flow (prd/phase-1.md §3.1–3.2): onboard from the DM, the
   * candidate gets an invitation, the conversation continues in the app. Email
   * is never the conversation channel.
   *
   * The fourth step is phase 3's board (prd/phase-3.md §2), and it is the step
   * that stops the page describing half the product: the site ran three steps
   * ending at the chat for as long as the chat was all there was.
   */
  test("how it works runs from the DM to the board", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const steps = landing.getSteps();
    await expect(steps.nth(0)).toContainText("Onboard them from the DM");
    await expect(steps.nth(0)).toContainText("only ever visible to you");
    await expect(steps.nth(1)).toContainText("invites@match.build");
    await expect(steps.nth(1)).toContainText("invite link");
    await expect(steps.nth(2)).toContainText("Carry on in the chat");
    await expect(steps.nth(3)).toContainText("match board");
  });

  /**
   * The shipped/unshipped line, asserted from both sides.
   *
   * Reply drafting shipped (prd/phase-2.md §4A) and belongs in the grid; the
   * extraction that fills a profile from the conversation did not (§4B) and
   * belongs in the callout. This test exists because the page spent a while
   * claiming the opposite of both — the callout is the one block on the site
   * that goes stale by *standing still*, so it is worth pinning down.
   */
  test("shipped AI is a feature, unshipped AI is the callout", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(
      landing.getFeatureCards().filter({ hasText: /Drafts in your voice/ }),
    ).toHaveCount(1);
    await expect(
      landing.getFeatureCards().filter({ hasText: /match board/i }),
    ).toHaveCount(1);

    await expect(landing.getComingNext()).toBeAttached();
    await expect(landing.getComingNext()).toContainText(
      "A profile that fills itself",
    );
  });

  test("theme toggle switches the document theme", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const before = await landing.themeClass();
    await landing.getThemeToggle().click();
    await expect.poll(() => landing.themeClass()).not.toBe(before);
  });
});

test.describe("faq", () => {
  test("a question expands to its answer and collapses again", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const question = landing.getFaqQuestion("Is this a dating app?");
    const answer = page.getByText("Your candidates never browse or swipe");

    await expect(question).toHaveAttribute("aria-expanded", "false");
    await expect(answer).toBeHidden();

    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");
    await expect(answer).toBeVisible();

    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "false");
    await expect(answer).toBeHidden();
  });
});

/**
 * The waitlist form validates with the same rules the `waitlist.mutations.join`
 * mutation enforces (`packages/api/convex/waitlist/rules.ts`, re-exported from
 * `@repo/api`). Only the client half is asserted here: this project's Convex
 * URL is a placeholder that never connects, so nothing may reach the backend.
 * The server half is covered by `convex/waitlist/mutations.test.ts`.
 */
test.describe("waitlist", () => {
  test("an empty submit asks for an email", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.getWaitlistSubmit().click();
    await expect(
      landing.getWaitlistForm().getByText("Enter your email address."),
    ).toBeVisible();
    await expect(landing.getWaitlistField("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("a malformed email and handle are rejected on Enter", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.getWaitlistField("Instagram").fill("not a handle!");
    await landing.getWaitlistField("Email").fill("ada@example");
    await landing.getWaitlistField("Email").press("Enter");

    const form = landing.getWaitlistForm();
    await expect(form.getByText("Enter a valid email address.")).toBeVisible();
    await expect(
      form.getByText("That doesn't look like an Instagram handle."),
    ).toBeVisible();
    await expect(landing.getWaitlistSuccess()).toHaveCount(0);
  });

  test("errors clear once the input is fixed", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const email = landing.getWaitlistField("Email");
    await email.fill("ada@example");
    await landing.getWaitlistSubmit().click();
    const error = landing
      .getWaitlistForm()
      .getByText("Enter a valid email address.");
    await expect(error).toBeVisible();

    // After a submit, Base UI re-validates on change.
    await email.fill("ada@example.com");
    await expect(error).toBeHidden();
  });

  /**
   * The honeypot is the one path that shows success without the backend, so it
   * is how the success state gets exercised here.
   */
  test("a filled honeypot short-circuits to the success state", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.getWaitlistField("Email").fill("bot@example.com");
    await landing
      .getWaitlistForm()
      .locator('input[name="website"]')
      .fill("https://spam.example", { force: true });
    await landing.getWaitlistSubmit().click();

    await expect(landing.getWaitlistSuccess()).toBeVisible();
    await expect(landing.getWaitlistSuccess()).toContainText(
      "You're on the list.",
    );
  });
});

/**
 * Motion behaviour.
 *
 * These are the only tests in the repo that exercise `motion` at runtime.
 * `apps/www` has ~70 `motion` usages across nine components, and before this
 * suite existed a `motion` upgrade could regress every scroll animation on the
 * page while `typecheck`, `test`, `check` and `build` all stayed green — which
 * is precisely why the 12 -> 13 bump was held back for its own change. Note
 * Playwright's `toBeVisible()` does NOT consider `opacity`, so a reveal that
 * never fires still reads as "visible"; these assert computed opacity instead.
 */
test.describe("motion", () => {
  test("below-the-fold content starts hidden and reveals on scroll", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    // The how-it-works steps live ~2 viewports down and are staggered children
    // of a `whileInView` group, so they must start fully transparent.
    const firstStep = landing.getSteps().first();
    await expect(firstStep).toHaveCSS("opacity", "0");

    await landing.wheel(16);
    await expect(firstStep).toHaveCSS("opacity", "1");
  });

  test("the hero drifts as it scrolls away", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const hero = landing.getHeroContent();
    // `useScroll` + `useTransform` map the hero's own scroll progress to a
    // 0 -> 120px drift, so at rest there is no transform at all.
    await expect(hero).toHaveCSS("transform", "none");

    await landing.wheel(4);
    await expect
      .poll(
        async () => await hero.evaluate((el) => getComputedStyle(el).transform),
      )
      .toMatch(/^matrix\(/);
  });

  test("the reading-progress bar advances with scroll", async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const scaleX = async () =>
      await landing.getReadingProgress().evaluate((el) => {
        const t = getComputedStyle(el).transform;
        // `matrix(a, b, c, d, tx, ty)` — `a` is the horizontal scale.
        const m = t.match(/matrix\(([^,]+),/);
        return m ? Number.parseFloat(m[1]) : 0;
      });

    expect(await scaleX()).toBeCloseTo(0, 2);

    await landing.wheel(12);
    // Springs settle asymptotically, so assert a threshold, not a value.
    await expect.poll(scaleX).toBeGreaterThan(0.2);
  });

  test("scrolling reaches the foot of the page and reveals the CTA", async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    expect(await landing.scrollY()).toBe(0);

    await landing.wheel(60);
    expect(await landing.scrollY()).toBeGreaterThan(1000);

    // Every reveal on the page should have fired by the time we are at the end.
    const reveals = landing.getReveals();
    for (let i = 0; i < (await reveals.count()); i++) {
      await expect(reveals.nth(i)).toHaveCSS("opacity", "1");
    }
  });
});

/**
 * `MotionProvider` branches on `useReducedMotion`: it skips Lenis entirely for
 * those users while `MotionConfig reducedMotion="user"` drops transforms and
 * keeps opacity. That branch had no coverage, and it is the accessible path.
 */
test.describe("reduced motion", () => {
  test("skips smooth scrolling but still reveals content", async ({ page }) => {
    const landing = new LandingPage(page);
    // Emulate before navigating: `MotionProvider` reads `useReducedMotion` at
    // mount to decide whether to render Lenis at all, so flipping the media
    // query after load would not re-run that branch. `reducedMotion` is not a
    // test-level `use` option in Playwright 1.62 — it is set through the media
    // emulation API.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await landing.goto();

    expect(await landing.hasLenis()).toBe(false);
    await expect(landing.getHeading()).toBeVisible();

    await landing.wheel(16);
    await expect(landing.getSteps().first()).toHaveCSS("opacity", "1");
  });
});
