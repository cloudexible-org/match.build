# Hackathon log

- **Project:** matchmaker
- **Event:** Convex All Gas Hackathon
- **What it does:** An operating system for independent human matchmakers: a unified client inbox (email + in-app chat) with AI-drafted replies and an AI-enriched client profile.
- **Live app:** not deployed
- **Repo:** https://github.com/cloudexible-org/matchmaker
- **Frontend:** Convex static hosting
- **Convex deployment:** not deployed
- **Components:** @convex-dev/static-hosting (two instances: `www`, `app`)
- **Convex features:** schema, tables, indexes, queries, mutations, internal functions, pagination, HTTP actions, realtime queries
- **Auth:** none
- **AI models:** none
- **Started:** 2026-09-19T15:37:25Z
- **Last updated:** 2026-09-19T16:36:21Z

## Log

### 2026-09-19 - ac539c4
Created the project and wrote the product spec (`PRD.md`). It covers the
matchmaker/client roles, multi-tenant data model, a three-agent AI design
(conversation, fact reconciliation, voice profile), email in and out through
Resend, and a build order that ships a working inbox before any AI.

### 2026-09-19 - 118de65
Scaffolded the monorepo from the turbostack template: a Vite React app, a Next.js
marketing site built as a static export, shared UI, and Playwright tests. Both
frontends are served from the Convex deployment by two static-hosting
instances: the marketing site at `/` and the app at `/app/`. The app's own HTTP
actions sit under `/api/`, starting with a health check. `pnpm ship` deploys the
backend and uploads both sites. Routing was verified on a local backend only.
Convex features: registered component, HTTP actions, plus the template's schema,
query and mutation (`packages/api/convex/convex.config.ts`,
`packages/api/convex/http.ts`, `packages/api/convex/messages.ts`).

### 2026-09-19 - d259c6c
Dev tooling: the app and marketing site now load their env vars from Doppler
when running `pnpm dev`, instead of hand-copied `.env.local` files
(`doppler.yaml`). The Vite app also switched to `@vitejs/plugin-react`.

### 2026-09-19 - 2699bf6
Made the Playwright suite safe to run from several git worktrees at once, for
parallel agents. Each run gets its own ports and its own local Convex backend
(pinned with `--local-cloud-port`), and a per-worktree lock stops two backends
sharing one database. Test servers also load env from Doppler without ever
pointing at the cloud deployment. Verified with two worktrees running
concurrently (`apps/e2e/playwright.config.ts`, `apps/e2e/scripts/convex-local.mjs`).

### 2026-09-19 - b156647
Added the waitlist backend: a `waitlist` table indexed by email, a public
`join` mutation that validates, normalises and dedupes sign-ups without
revealing who is already on the list, and an internal paginated query to read
them. Validation rules are shared with the frontend. First Convex unit tests,
with convex-test. Convex features: schema, index, mutation, internal query,
pagination (`packages/api/convex/waitlist/`).

### 2026-09-19 - 59b130f
Replaced the template landing page with the Matchmaker marketing site: an
illustrated product still of a client thread with an AI-suggested reply, how it
works, features, the "AI drafts, you decide" principles, privacy, FAQ, and a
waitlist form that calls the `join` mutation from the static site
(`apps/www/components/landing/waitlist.tsx`). Covered by Playwright specs.
