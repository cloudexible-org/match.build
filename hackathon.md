# Hackathon log

- **Project:** matchmaker
- **Event:** Convex All Gas Hackathon
- **What it does:** An operating system for independent human matchmakers: a unified client inbox (email + in-app chat) with AI-drafted replies and an AI-enriched client profile.
- **Live app:** not deployed
- **Repo:** https://github.com/cloudexible-org/matchmaker
- **Frontend:** Convex static hosting
- **Convex deployment:** not deployed
- **Components:** @convex-dev/static-hosting (two instances: `www`, `app`)
- **Convex features:** schema, tables, queries, mutations, HTTP actions, realtime queries
- **Auth:** none
- **AI models:** none
- **Started:** 2026-09-19T15:37:25Z
- **Last updated:** 2026-09-19T15:56:48Z

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
