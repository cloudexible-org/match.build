import { defineConfig, devices, type Project } from "@playwright/test";
import base, {
  ADMIN_URL,
  APP_URL,
  WITH_CONVEX,
  WWW_URL,
} from "@repo/harness/playwright.config";

/**
 * Five suites, three apps.
 *
 * Everything about the world — the local Convex backend, the seed, the three
 * app servers, the per-run port allocation, the timeouts — comes from
 * `@repo/harness`. All this file adds is which directory holds which specs,
 * and that is deliberately the only difference between this run and a
 * marketing capture (`tooling/marketing`).
 *
 * `specs/app` drives `apps/app` (Vite), `specs/admin` drives `apps/admin`
 * (Vite) and `specs/www` drives `apps/www` (Next.js), all asserting only on
 * statically-rendered chrome and client-side behaviour. `specs/app-convex` and
 * `specs/admin-convex` drive `apps/app` and `apps/admin` against a real, seeded
 * Convex local backend.
 *
 * Each project pins its own `baseURL` rather than inheriting a shared one, so a
 * spec cannot silently assert against the wrong app — the defect recorded as
 * (1) in §2 of `docs/e2e-architecture.md`.
 */

const projects: Project[] = [
  {
    name: "app",
    testDir: "./specs/app",
    use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
  },
  {
    name: "admin",
    testDir: "./specs/admin",
    use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
  },
  {
    name: "www",
    testDir: "./specs/www",
    use: { ...devices["Desktop Chrome"], baseURL: WWW_URL },
  },
];

if (WITH_CONVEX) {
  projects.push({
    name: "app-convex",
    testDir: "./specs/app-convex",
    use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
  });
  // Also signs in to apps/app with an issued code, in a second browser
  // context pointed at APP_URL (see `appContext` in the spec).
  projects.push({
    name: "admin-convex",
    testDir: "./specs/admin-convex",
    use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
  });
}

export default defineConfig({
  ...base,
  testDir: "./specs",
  projects,
});
