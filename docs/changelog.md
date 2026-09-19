# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The monorepo was bootstrapped from [turbostack](https://github.com/cloudexible-org/turbostack)
4.5.0; its history lives in that repository.

## [Unreleased]

### Added
- **Monorepo from turbostack 4.5.0:** Turborepo + pnpm with `apps/www` (Next.js marketing site), `apps/app` (Vite React app), `apps/e2e` (Playwright), and `packages/{api,ui,analytics,config}`. Renamed to `matchmaker` throughout (package name, portless hosts `www.matchmaker.localhost` / `app.matchmaker.localhost`, page titles, e2e selectors).
- **Hosting on Convex (`.convex.site`) via `@convex-dev/static-hosting`:** two component instances in `packages/api/convex/convex.config.ts` — `www` mounted at `/` and `app` at `/app/` — with the app's own HTTP actions under `/api/` (`convex/http.ts`, starting with `GET /api/health`). `pnpm ship` deploys the backend and uploads both sites; `pnpm ship:preview` uploads both to the dev deployment for a hosted smoke test. *Why:* one origin and one deploy target for backend and both frontends, instead of Vercel. Verified against a local backend: `/`, `/app/`, deep links under `/app/…` (SPA fallback), `/app/assets/*`, and `/api/health` all resolve; unknown top-level paths 404.

### Changed
- **`apps/www` is a static export:** `output: "export"`, `trailingSlash: true`, unoptimised images, and `manifest.ts` marked `force-static`. The Clerk middleware (`proxy.ts`), Clerk provider and sign-in/up buttons are gone — a static site has no server to run them — and "Get Started"/"Sign In" now link to `/app/`, where auth will live.
- **`apps/app` builds with `base: "/app/"`** (overridable by the static-hosting CLI's `STATIC_HOSTING_BASE_PATH`); the service worker registers from `BASE_URL` and caches `./` rather than `/`. The e2e `app` projects navigate to `/app/`.

- **`apps/app` uses `@vitejs/plugin-react` instead of `@vitejs/plugin-react-swc`:** *Why:* Vite 8 (Rolldown) warns that the SWC plugin is slower when no SWC plugins are configured, and none are; `plugin-react` does Fast Refresh through Oxc there. Build, typecheck and e2e unchanged.

### Removed
- Vercel: both `vercel.json` files, `@vercel/analytics`, the `VERCEL` build-cache input and standalone-output switch. Docker (`apps/www/Dockerfile`, `docker-compose.yml`) and `.gitlab-ci.yml`, which targeted the standalone Next server that no longer exists.
