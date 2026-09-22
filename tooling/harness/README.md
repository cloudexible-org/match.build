# `@repo/harness`

The world every browser run shares. It registers **no tests of its own** — it
is what `tooling/e2e` and `tooling/marketing` are both built on.

| Import | What it gives you |
|---|---|
| `@repo/harness/playwright.config` | The base config (default export) plus `APP_URL`, `ADMIN_URL`, `WWW_URL`, `WITH_CONVEX`. Spread it, add `testDir` and `projects`. |
| `@repo/harness/page-objects` | Every page object, namespaced: `POM.App.ConversationPage`. One file at a time: `@repo/harness/page-objects/app/matches.page`. |
| `@repo/harness/scenario` | `seedScenario()` — a world of this file's own, namespaced so nothing else can see it. |
| `@repo/harness/session` | `signInAs(page, email)` — the real Convex Auth flow over HTTP, about ten times faster than typing a code. It arms the session; your next `goto` applies it. |
| `@repo/harness/accounts` | `signUp` / `signInToAdmin`, for the specs that are *about* signing up. |
| `@repo/harness/seed` | The baseline fixture's constants and types (`SEED_ADMINS`, …). |
| `@repo/harness/paths` | `REPO_ROOT`, `API_DIR`, `SCRATCH_DIR`, `appDir()`. |
| `@repo/harness/a11y` | The axe-core scan. |

The rest — `local-backend.ts`, `free-port.ts`, `doppler.ts`, `auth-env.ts`,
`sign-in-codes.ts` and the outbox readers — is machinery the config drives; a
spec rarely reaches for it directly.

## Why a package rather than a folder

Two things it buys that a shared directory would not.

**Paths stop depending on where the caller sits.** Playwright resolves a
config's relative paths against *that config's own directory*, so a relative
`globalSetup` or `webServer.cwd` inherited by `tooling/marketing` would resolve
into `tooling/marketing/` and the run would start with no backend and no seed.
Everything the base config hands out is absolute, anchored on
[`paths.ts`](paths.ts), and a consumer never counts directory levels.

**One page object, two consumers.** The demo captures drive the app through the
same page objects as the suite. When a `data-testid` moves, the spec that
covers it fails and the clip that films it follows — rather than the clip
quietly photographing the wrong element for a month.

## Running the backend on its own

```bash
pnpm --filter @repo/harness convex:local
```

Starts this worktree's local Convex backend on a fresh port, under a
per-worktree lock. Normally the Playwright `webServer` does this for you.

See [`docs/e2e-architecture.md`](../../docs/e2e-architecture.md) for how the
backend, the ports and the seed actually work — especially §1a and §1c before
changing any of it.
