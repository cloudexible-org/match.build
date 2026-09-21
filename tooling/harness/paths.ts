import * as path from "node:path";

/**
 * Every location the harness, the suite or a marketing capture might need,
 * resolved once from this file's own position.
 *
 * These used to be spelled `../../packages/api/…` at each call site, which is
 * correct only for a file at one particular depth and silently wrong at any
 * other — and the paths that matter most are the ones Playwright resolves
 * against *the config's own directory*. `tooling/e2e` and `tooling/marketing`
 * each have a config of their own now, so a relative `globalSetup` or
 * `webServer.cwd` inherited from the base config would resolve against the
 * consumer's directory and start a run with no backend. Anchoring them here
 * means a consumer never counts directory levels.
 */

/** The monorepo root. */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** `packages/api` — the Convex backend, its schema, seed and env files. */
export const API_DIR = path.join(REPO_ROOT, "packages", "api");

/** This package, `tooling/harness`. */
export const HARNESS_DIR = __dirname;

/**
 * `<root>/.scratch` — the repo's one scratch area, gitignored.
 *
 * Generated output that is reproducible and too heavy for git history lives
 * here: demo capture frames and the clips rendered from them. One location at
 * the root rather than one per package, so there is a single thing to look in
 * and a single thing to clear. See `.scratch/README.md`.
 */
export const SCRATCH_DIR = path.join(REPO_ROOT, ".scratch");

/** An app's directory, e.g. `appDir("app")` → `<root>/apps/app`. */
export const appDir = (name: string): string =>
  path.join(REPO_ROOT, "apps", name);
