import { defineConfig, devices } from "@playwright/test";
import base, { ADMIN_URL, APP_URL } from "@repo/harness/playwright.config";

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
   * Two projects, replacing the suite's five — one per app a demo can be
   * filmed against. Each capture sets its own viewport and colour scheme with
   * `test.use`.
   *
   * They are split by **filename** rather than by directory so that every demo
   * stays in one place (`captures/demos/`, which is what `capture:demo` and
   * the docs both name) and `render:demo --name <x>` keeps matching the spec
   * called `<x>.spec.ts`. A capture that drives `apps/admin` is prefixed
   * `admin-`; anything else gets the app. Without the split a capture would
   * inherit `baseURL: APP_URL` and quietly photograph the *app* at
   * `/admin/usage`, which 404s.
   */
  projects: [
    {
      name: "capture",
      testIgnore: /admin-[^/]*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "capture-admin",
      testMatch: /admin-[^/]*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
    },
  ],
});
