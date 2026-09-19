# Hackathon log

- **Project:** matchmaker
- **Event:** Convex All Gas Hackathon
- **What it does:** An operating system for independent human matchmakers: invite candidates from Instagram/WhatsApp into an in-app chat, with AI-drafted replies and an AI-enriched candidate profile planned for later phases.
- **Live app:** not deployed
- **Repo:** https://github.com/cloudexible-org/matchmaker
- **Frontend:** Convex static hosting
- **Convex deployment:** not deployed
- **Components:** @convex-dev/static-hosting (two instances: `www`, `app`)
- **Convex features:** schema, tables, indexes, queries, mutations, actions, internal functions, pagination, HTTP actions, realtime queries, typed env vars
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-19T15:37:25Z
- **Last updated:** 2026-09-19T18:32:22Z

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

### 2026-09-19 - f578000
Reworked the spec into a `prd/` folder of phases after reviewing it for gaps.
Phase 1 is final: accounts that can own several matchmaker and candidate
profiles, onboarding by invitation (email or shareable link), in-app chat only,
notifications, an append-only audit trail, and a "nothing is deleted" rule.
Email is no longer a conversation channel, and auth moves from Clerk to Convex
Auth. AI (phase 2) and matching (phase 3) stay as drafts.

### 2026-09-19 - 3ebacab
Rewrote the marketing site's copy to match phase 1: the invitation flow, chat
in the app, "candidates" instead of "clients", and AI features framed as coming
next (`apps/www/components/landing/`). Playwright specs updated.

### 2026-09-19 - d5c0997
Phase 1 step 1: sign-in with Convex Auth using an email plus a six-digit code,
one flow for sign-in and sign-up, then a name step for new accounts. A custom
user callback keeps one account per email and never reuses a deleted one. Codes
go out through Resend when a key is set, otherwise into an internal outbox table
the e2e suite reads. Added the full phase-1 schema, tenant access helpers and an
append-only audit trail written in the same mutation as each change, plus the
app shell and home page. `convex/http.ts` now owns the whole site so Convex
Auth's discovery document can sit at the root. Convex features: Convex Auth,
schema, indexes (including a nested-field index), queries, mutations, internal
functions, HTTP actions, typed env vars (`packages/api/convex/auth.ts`,
`packages/api/convex/users/`, `packages/api/convex/audit/`,
`packages/api/convex/http.ts`).

### 2026-09-19 - ac07f1f
Dev and deployment plumbing. Picked an interim custom domain for production
until a product domain is bought (documented only, not deployed). Local dev now
serves both sites from one origin, with the Vite server proxying everything
outside `/app` to Next, mirroring production. `auth.config.ts` reads the site
URL through the generated typed env so `convex dev` typechecks
(`apps/app/vite.config.ts`, `packages/api/convex/auth.config.ts`).
