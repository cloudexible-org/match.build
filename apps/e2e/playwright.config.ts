import { defineConfig, devices, type Project } from "@playwright/test";
import { convexEnabled } from "./convex-enabled";
import { withDoppler } from "./doppler";
import { stablePorts } from "./free-port";
import { ensureLocalDeployment, localBackendUrl } from "./local-backend";

/**
 * Three suites, two apps, up to three servers.
 *
 * `specs/app` drives `apps/app` (Vite) and `specs/www` drives `apps/www`
 * (Next.js), both asserting only on statically-rendered chrome and client-side
 * behaviour. `specs/app-convex` drives `apps/app` against a real, seeded Convex
 * local backend.
 *
 * Each project pins its own `baseURL` rather than inheriting a shared one, so a
 * spec cannot silently assert against the wrong app — the defect recorded as
 * (1) in §2 of `docs/e2e-architecture.md`.
 */

const WITH_CONVEX = convexEnabled();

/**
 * Every server this run starts listens on a port the OS hands us, never a
 * fixed or recorded one. That is what lets any number of runs — one per git
 * worktree, alongside each worktree's `pnpm dev` — share a machine: nothing is
 * contended, so nothing collides. See §1c of `docs/e2e-architecture.md`.
 *
 * The Convex pair included: the port recorded in the local deployment's
 * `config.json` is only free until another worktree's backend claims it, and
 * every worktree's anonymous deployment is named `anonymous-agent`, so the
 * Convex CLI cannot tell theirs from ours and refuses to start. The
 * `convex-local.mjs` webServer is handed these ports instead.
 *
 * Memoised through the environment because Playwright re-evaluates this file in
 * every worker process; see `free-port.ts` for why allocating directly here
 * makes every spec fail with `ERR_CONNECTION_REFUSED` at a different port.
 */
const [APP_PORT, WWW_PORT, CONVEX_PORT, CONVEX_SITE_PORT] = stablePorts([
  "E2E_APP_PORT",
  "E2E_WWW_PORT",
  "E2E_CONVEX_PORT",
  "E2E_CONVEX_SITE_PORT",
]);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const WWW_URL = `http://127.0.0.1:${WWW_PORT}`;

// Provision this worktree's local deployment up front (a no-op once it
// exists), so global setup has an admin key to seed with.
if (WITH_CONVEX) ensureLocalDeployment();

const CONVEX_URL = WITH_CONVEX ? localBackendUrl() : undefined;

/**
 * What `apps/app` validates at startup. Without Convex it is a well-formed
 * placeholder that is never connected to — the app mounts, renders its chrome,
 * and its `useQuery` simply never resolves.
 */
const VITE_CONVEX_URL = CONVEX_URL ?? "https://ci-e2e-placeholder.convex.cloud";

/**
 * A distDir of the suite's own, so its `next dev` does not contend with a
 * developer's for the lock at `<distDir>/lock`. See `apps/www/next.config.ts`.
 */
const WWW_DIST_DIR = ".next-e2e";

/**
 * What the harness sets on each app server. These win over Doppler (see
 * `doppler.ts`) and over any `.env.local`, so the apps always talk to the
 * backend this run chose — the local one, or a placeholder that never
 * connects — and never to a cloud deployment.
 */
const APP_ENV = { VITE_CONVEX_URL };
const WWW_ENV = {
  NEXT_DIST_DIR: WWW_DIST_DIR,
  NEXT_PUBLIC_CONVEX_URL: VITE_CONVEX_URL,
};

const projects: Project[] = [
  {
    name: "app",
    testDir: "./specs/app",
    use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
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
}

export default defineConfig({
  testDir: "./specs",
  // Proves the backend is ours, then reseeds. No-ops when E2E_CONVEX=0.
  globalSetup: "./fixtures/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `open: "never"` — the default ("on-failure") serves the report and blocks
  // the process, which hangs any non-interactive run (CI, agents, `&&` chains).
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    trace: "on-first-retry",
  },
  projects,
  webServer: [
    ...(WITH_CONVEX
      ? [
          {
            // Never reused. The port is fresh for this run, so anything already
            // answering on it is not ours. `convex-local.mjs` also holds a
            // per-worktree lock, so a second run in the *same* worktree fails
            // loudly instead of starting a second backend on the same database
            // file — or reseeding it under the first run's feet.
            command: "node apps/e2e/scripts/convex-local.mjs",
            url: `${CONVEX_URL}/version`,
            cwd: "../..",
            reuseExistingServer: false,
            env: {
              E2E_CONVEX_PORT: String(CONVEX_PORT),
              E2E_CONVEX_SITE_PORT: String(CONVEX_SITE_PORT),
            },
            timeout: 180_000,
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
    {
      // Run Vite as a DIRECT child. The previous `pnpm --filter app dev` went
      // pnpm → portless → vite, so Playwright killed the wrapper, vite survived
      // reparented to PID 1 still holding 5173, and teardown timed out after
      // every test had already passed. See `docs/e2e-architecture.md` §3.
      command: withDoppler(
        "app",
        `pnpm exec vite --port ${APP_PORT} --strictPort`,
        APP_ENV,
      ),
      cwd: "../app",
      // The app is mounted at /app/ (vite `base`); `/` is a Vite 404.
      url: `${APP_URL}/app/`,
      // Never adopt a server we did not start: a developer's `pnpm dev` carries
      // the VITE_CONVEX_URL from apps/app/.env.local — your *cloud* deployment —
      // so the suite would assert against cloud data while global setup seeded
      // the local backend, and every assertion would measure the wrong
      // database. The port is ours alone, so this should never trigger; with
      // `--strictPort` a lost race is a loud failure rather than a silent
      // attachment to something else.
      reuseExistingServer: false,
      // Overrides whatever apps/app/.env.local says. This is the whole reason
      // running the suite cannot disturb your dev setup, and vice versa.
      env: APP_ENV,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Next as a direct child too, for the same teardown reason.
      //
      // `NEXT_DIST_DIR` is what lets this coexist with a running `pnpm dev`:
      // Next 16's dev lock lives at `<distDir>/lock`, so two `next dev`
      // processes sharing `.next` refuse to start and a different port does not
      // help. Giving the suite its own distDir gives it its own lock.
      command: withDoppler(
        "www",
        `pnpm exec next dev --port ${WWW_PORT} --hostname 127.0.0.1`,
        WWW_ENV,
      ),
      cwd: "../www",
      url: WWW_URL,
      reuseExistingServer: false,
      env: WWW_ENV,
      // A cold `.next-e2e` compiles from scratch on the first request.
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
