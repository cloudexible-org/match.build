import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Fails the test on any WCAG A/AA violation axe-core can detect on the
 * current page: unlabelled controls, contrast, heading order, landmarks and
 * the rest. Automated rules catch a fraction of real accessibility problems,
 * but the fraction they catch is exactly the kind a refactor reintroduces.
 *
 * `exclude` skips a selector — for a known third-party or transitional
 * element, with a comment saying why.
 */
export async function expectNoA11yViolations(
  page: Page,
  options: { exclude?: string[] } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  const { violations } = await builder.analyze();
  expect(
    violations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}
