# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The monorepo was bootstrapped from [turbostack](https://github.com/cloudexible-org/turbostack)
4.5.0; its history lives in that repository.

## [Unreleased]

### Added
- **Doppler for app env vars:** a root `doppler.yaml` binds `apps/app` to the `matchmaker_app` project and `apps/www` to `matchmaker_www` (`dev` config), and both `dev` scripts now run under `doppler run --`. *Why:* secrets live in one place instead of hand-copied `.env.local` files. The e2e suite uses Doppler too — see *Changed* below.
- **Monorepo from turbostack 4.5.0:** Turborepo + pnpm with `apps/www` (Next.js marketing site), `apps/app` (Vite React app), `apps/e2e` (Playwright), and `packages/{api,ui,analytics,config}`. Renamed to `matchmaker` throughout (package name, portless hosts `www.matchmaker.localhost` / `app.matchmaker.localhost`, page titles, e2e selectors).
- **Hosting on Convex (`.convex.site`) via `@convex-dev/static-hosting`:** two component instances in `packages/api/convex/convex.config.ts` — `www` mounted at `/` and `app` at `/app/` — with the app's own HTTP actions under `/api/` (`convex/http.ts`, starting with `GET /api/health`). `pnpm ship` deploys the backend and uploads both sites; `pnpm ship:preview` uploads both to the dev deployment for a hosted smoke test. *Why:* one origin and one deploy target for backend and both frontends, instead of Vercel. Verified against a local backend: `/`, `/app/`, deep links under `/app/…` (SPA fallback), `/app/assets/*`, and `/api/health` all resolve; unknown top-level paths 404.

### Changed
- **e2e runs in several worktrees at once without colliding** (`docs/e2e-architecture.md` §1c). Parallel agents each work in their own git worktree and may all run the suite at the same time. Each run now brings up its own Vite, Next and Convex backend, and nothing is shared between them:
  - **Convex ports are allocated per run** and passed to the CLI with `--local-cloud-port` / `--local-site-port`. `scripts/convex-local.mjs` writes them into the worktree's `config.json` before starting. Before, a worktree's recorded port could be held by a sibling's backend. Every anonymous deployment is named `anonymous-agent`, so the CLI mistook the sibling for its own backend and refused to start.
  - **All ports come from 20000–32000, via `scripts/pick-ports.mjs`, instead of `listen(0)`.** Port 0 draws from the OS's ephemeral range, which outgoing connections also use. With two suites running, `next dev` hit `EADDRINUSE` on a port the allocator had just released. Next also binds `127.0.0.1` explicitly now.
  - **One backend per worktree** (`packages/api/.convex/e2e-backend.lock`). A second run in the same checkout fails straight away instead of starting a second backend on the same SQLite file or wiping the database mid-run. The Convex webServer is no longer reused (`reuseExistingServer: false`). A stale lock left by a killed run is taken over once its holder is confirmed dead.
  - Verified with two worktrees, one with no deployment yet: three rounds of both suites at once, 21/21 each time. Also tested: both worktrees recording the same port (both passed) and two runs in one worktree (the second was refused, the first passed).
- **e2e app servers run under Doppler:** `apps/e2e/doppler.ts` wraps the Vite and Next `webServer` commands in `doppler run --project matchmaker_{app,www} --config dev`, so the suite gets the same env as `pnpm dev`. Variables the harness sets itself (`VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_DIST_DIR`) are passed to `--preserve-env`. By default Doppler would override them with the *cloud* Convex URL, and the suite would then talk to your cloud deployment while seeding the local one. `E2E_DOPPLER=0` runs the servers without Doppler (CI sets it: CI has no Doppler token), and `E2E_DOPPLER_CONFIG` selects a different config.
- **The e2e `www` server now gets a Convex URL from the harness**, the same local or placeholder URL as `apps/app`. Before, it relied on `apps/www/.env.local`: a fresh checkout failed env validation, and a filled-in one pointed the site under test at a cloud deployment.
- **`apps/www` is a static export:** `output: "export"`, `trailingSlash: true`, unoptimised images, and `manifest.ts` marked `force-static`. The Clerk middleware (`proxy.ts`), Clerk provider and sign-in/up buttons are gone — a static site has no server to run them — and "Get Started"/"Sign In" now link to `/app/`, where auth will live.
- **`apps/app` builds with `base: "/app/"`** (overridable by the static-hosting CLI's `STATIC_HOSTING_BASE_PATH`); the service worker registers from `BASE_URL` and caches `./` rather than `/`. The e2e `app` projects navigate to `/app/`.

- **`apps/app` uses `@vitejs/plugin-react` instead of `@vitejs/plugin-react-swc`:** *Why:* Vite 8 (Rolldown) warns that the SWC plugin is slower when no SWC plugins are configured, and none are; `plugin-react` does Fast Refresh through Oxc there. Build, typecheck and e2e unchanged.

### Removed
- Vercel: both `vercel.json` files, `@vercel/analytics`, the `VERCEL` build-cache input and standalone-output switch. Docker (`apps/www/Dockerfile`, `docker-compose.yml`) and `.gitlab-ci.yml`, which targeted the standalone Next server that no longer exists.
