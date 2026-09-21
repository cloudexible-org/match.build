import { defineConfig, devices } from "@playwright/test";
import base, { APP_URL } from "@repo/harness/playwright.config";

/**
 * Marketing capture — the demo clips that go in the pitch deck. Run on demand,
 * never in CI, never by `pnpm test:e2e`:
 *
 *   pnpm capture:demo
 *   pnpm render:demo -- --name inbox-ai-reply
 *
 * Everything about the world comes from `@repo/harness`: the same local Convex
 * backend, the same seed, the same app servers the suite uses, and the same
 * page objects — so when a `data-testid` moves, the demos follow the suite
 * instead of silently photographing the wrong element.
 *
 * Being its own package is what stops an ordinary `pnpm test:e2e` from reaching
 * these, and stops a capture script's assert-nothing style from being mistaken
 * for a test. A `testDir` pointing elsewhere would not: someone would
 * eventually run `playwright test` from the repo root and film a suite.
 */
export default defineConfig({
  ...base,
  testDir: "./captures",
  // Each capture is a single linear script; there is nothing to parallelise,
  // and two of them writing frames at once would fight for the CPU that the
  // screenshots need.
  workers: 1,
  // A capture asserts nothing, so a retry would just redo the work and
  // overwrite the frames it already wrote.
  retries: 0,
  reporter: "list",
  /**
   * One project, replacing the suite's five. Marketing only films `apps/app`;
   * each capture sets its own viewport and colour scheme with `test.use`.
   */
  projects: [
    {
      name: "capture",
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
  ],
});
