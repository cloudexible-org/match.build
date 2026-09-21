# Hackathon log

- **Project:** match.build
- **Event:** Convex All Gas Hackathon
- **What it does:** An operating system for independent human matchmakers: invite candidates from Instagram/WhatsApp into an in-app chat, with AI-drafted replies and an AI-enriched candidate profile planned for later phases.
- **Live app:** https://www.match.build (app at /app/)
- **Repo:** https://github.com/cloudexible-org/match.build
- **Frontend:** Convex static hosting
- **Convex deployment:** https://api.match.build (CONVEX_CLOUD_URL custom domain)
- **Components:** @convex-dev/static-hosting (three instances: `www`, `app`, `admin`), @convex-dev/agent
- **Convex features:** schema, tables, indexes, queries, mutations, actions, internal functions, scheduled functions, crons, pagination, paginated queries, HTTP actions, realtime queries, typed env vars
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5.6-luna, through the Convex AI Gateway (`convexGateway(settings.model)`; the id is seeded into `aiAgentSettings` and editable at /admin/ai)
- **Started:** 2026-09-19T15:37:25Z
- **Last updated:** 2026-09-21T17:05:55Z

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

### 2026-09-19 - 18f403b
Seeded the dev deployment with six test accounts — a matchmaker, joined
candidates, an invited person, a blank account — so each flow has an account in
the right state. The seed only adds what is missing, and refuses to run unless
the site URL is on `.localhost` and no Resend key is set, so it can never touch
production (`packages/api/convex/seed/dev/`).

### 2026-09-19 - 1df4681
Production went live on the interim domain: the marketing site at `/`, the app
at `/app/`, auth discovery and HTTP actions on the same origin, with a second
custom domain for the client API. Sign-in codes now come from the verified
domain, and the app renders at the bare `/app` path, which production serves
without a redirect (`README.md`, `apps/app/src/main.tsx`).

### 2026-09-19 - 7002ca9
Phase 1 step 2: any account can create a matchmaker profile and open its
workspace. Usernames are validated by shared rules — 6–30 characters, no doubled
or edge periods, reserved names refused — and uniqueness is on a canonical key
with dots removed, so `jane.smith` is taken once `janesmith` exists. Profile and
workspace queries answer `null` alike for "not yours" and "does not exist", so
the URL cannot be used to probe for usernames. Convex features: mutations,
queries, indexes (`packages/api/convex/matchmakers/`).

### 2026-09-19 - b9fc40e
Phase 1 step 3: onboarding a candidate. One mutation writes the candidate, their
conversation, the pasted DM history as a private first message, an open invite
and the audit events, so a half-onboarded candidate cannot exist. Invite links
are HMAC-SHA256 of a per-invite nonce under a deployment secret, so only the
nonce and the token's hash are stored yet the matchmaker can copy the same link
again at any time (`packages/api/convex/candidates/mutations.ts`,
`packages/api/convex/invites/helpers.ts`).

### 2026-09-19 - 73d043d
Phase 1 step 4: invitations end to end. The invite email goes out from a
scheduled action through Resend, or to the internal outbox without a key, and
re-derives its token from the nonce so no token sits in the scheduler's stored
arguments. The candidate accepts or declines by link or from their home page;
accepting links the account and opens the chat. Accepting is refused, with the
invite left open, for the profile's owner, an existing member, or someone who
already left that book. Each invite schedules its own 30-day expiry, hopping at
most 20 days at a time to stay under the timer limit. The matchmaker can resend
(3 a day, counted from the audit trail), change the address or revoke. Convex
features: scheduled functions, actions, mutations (`packages/api/convex/invites/`).

### 2026-09-19 - 5c4c8b9
A third frontend: the platform admin app at `/admin/`, on the same deployment
and origin. It has the platform-wide audit trail — filtered by matchmaker, by
one of its candidates, by the account that acted, or by action, with the filters
in the URL — and a page that issues a sign-in code for any account, so support
can sign in to the app as someone to reproduce a problem. The code is shown to
the admin, never emailed to the account's owner, and issuing it is audited. Who
gets in comes from the deployment: every `convex/admin/` function starts with
`requirePlatformAdmin`, which checks the caller's verified address against the
`PLATFORM_ADMIN_EMAILS` env var. Each filter combination has its own index on
`auditEvents`, so no filter scans the table. Convex features: paginated queries,
indexes, queries, mutations, registered component
(`packages/api/convex/admin/`, `apps/admin/`).

### 2026-09-19 - ae9e09a
Rebuilt how the e2e suite gets its data. Each spec file now seeds its own
accounts, profiles, candidates, threads and invites in `beforeAll`, namespaced
per file and run, so files can't touch each other's rows whatever order they
run in. That reaches states the UI can't produce quickly: an invite that has
expired but still has a real openable link, someone who left a month ago, an
invitation already emailed three times today. Specs sign in over HTTP through
the real Convex Auth code flow instead of typing a code, which is about ten
times faster. Tests within a file now run serially and files in parallel, so a
file's tests can share its world. Added tenant-isolation, phone-layout and
axe accessibility suites, and an observe mode (`pnpm test:e2e:observe`) that
runs headed with a pause between actions. 38 tests became 81; CI no longer runs
the suite (3fc2e94), so it guards locally
(`apps/e2e/scenario.ts`, `apps/e2e/session.ts`,
`packages/api/convex/seed/e2e/scenario.ts`).

### 2026-09-19 - 2ec76b5
Phase 1 step 5: chat. Both sides hold one conversation and see each other's
messages without a refresh — proven by driving two browser sessions at once.
One sequence per conversation is allocated server-side, so ordering can't race,
and sending moves the conversation's counters with it. The matchmaker's private
imported history never reaches the candidate: their thread reads through the
visibility index, which can't return anything else. Read markers only move
forward and never past what that side can see, and the app reports them only
while the thread is open and the tab is visible — the same rule notifications
will use. Unread counts come straight from the counters, and scrollback pages 30
at a time. Convex features: paginated queries, realtime queries, indexes,
mutations (`packages/api/convex/messages/`, `apps/app/src/chat/`).

### 2026-09-19 - f7879a3
Phase 1 step 6: the candidate panel. Details (the matchmaker's own label and
social handles, plus membership and the status that drives the list filters),
private Notes with add, edit and soft remove, and a History tab reading the
audit trail — paginated, filtered by area, each entry naming who did it. The
sentences are rendered from the recorded events rather than written at the call
site, so the log and the display can't drift. Seeded worlds now carry their
membership history too, so a seeded candidate's History reads like a real one's.
Convex features: paginated queries, indexes, queries, mutations
(`packages/api/convex/notes/`, `packages/api/convex/audit/queries.ts`,
`apps/app/src/workspace/candidate-panel.tsx`).

### 2026-09-19 - f1b40a3
The panel's three tabs became collapsible sections, so the details and the notes
can be read at once, and the app header gained a control that cycles light,
dark and the device's own setting. Writing it found that dark had never actually
worked when chosen: the design tokens only defined their dark values inside a
`prefers-color-scheme` block, so forcing the class did nothing on a light
device. The palette is now defined once and applied by either. The first test
passed while the feature was broken because it only checked the class, so it now
asserts the rendered colour and scans dark mode for contrast
(`packages/ui/src/components/accordion.tsx`, `apps/app/src/theme/`,
`packages/ui/src/styles/theme.css`).

### 2026-09-20 - 96f8fcd
Phase 1 step 7: leaving and account deletion. A candidate can leave from their
chat menu with an optional reason, and nothing is removed from the matchmaker —
the thread, notes and trail stay readable, the banner and the closed composer
both say when they left, and re-inviting relinks the same record so one person
keeps one history. Account settings arrived at `/settings`, where deleting the
account is confirmed with an emailed six-digit code kept only as a hash; it
can't sign anyone in, and five wrong guesses throw it away. Deleting marks every
linked candidate `account_deleted` with one audit event in that matchmaker's
trail alone, so none of them learns about the others, keeps the user row because
the matchmakers' records still name that person, and removes the account's
sessions and credentials — the only hard delete in the product, and only auth
plumbing. Refusals are returned rather than thrown, because a throwing mutation
rolls back its own writes and so could never have counted the wrong guess that
caused it. Writing the accessibility scan for the new screens found that message
timestamps on your own bubble had been below the AA contrast ratio, and that the
existing scan of the chat had been passing by racing the thread's render. Convex
features: mutations, internal actions, scheduled functions, indexes
(`packages/api/convex/users/`, `packages/api/convex/candidates/mutations.ts`,
`apps/app/src/pages/account-settings.tsx`).

### 2026-09-20 - 2d0f09c
Phase 1 step 8, and the last step of phase 1: notifications. A message you
don't open reaches you by push after ~30 seconds and by email after ~5 minutes;
one you do open reaches you not at all. Nothing is sent when a message is
written — a job is scheduled, and when it fires it re-reads the conversation and
asks whether the read marker has passed the message. One row per (conversation,
recipient, channel), so a burst can only have one job pending per channel and a
later message rides on it. Notifications say who wrote and link to the thread,
never what they wrote: they are read on lock screens. Web push is RFC 8291
encryption and an RFC 8292 VAPID JWT written directly on Web Crypto rather than
the web-push package, so sending stays in Convex's own runtime instead of a
"use node" action; the RFC's published worked example is replayed byte for byte
in the tests, which is the only way to catch a bad payload, since a push service
accepts it and the browser silently drops it. The app also became installable —
manifest, icons, and a service worker that caches nothing on purpose. Convex
features: scheduled functions, mutations, internal actions, indexes
(`packages/api/convex/notifications/`, `apps/app/src/notifications/`).

### 2026-09-21 - 4d72d10
Renamed the product from Matchmaker to match.build across the apps, the specs
and the marketing copy, and with it the dev hostname and the Doppler project.
"Matchmaker" stays where it means the *role* — the schema, the access helpers
and the UI all still talk about a matchmaker and their candidates — so this
touched the product name only.

### 2026-09-21 - 360b65b
Erasure requests (`/admin/erasure`), resolving the one place where the "nothing
is deleted" rule and a right-to-erasure request genuinely conflict: it erases
the **person**, not the record. A person's name, address and handles go
everywhere they appear — their account, every matchmaker's record of them, and
the values inside the audit trail — while every conversation, message, note and
audit event stays. Each matchmaker keeps a full history of the work they did,
attached to a candidate nobody can be identified from, and a `candidate.anonymised`
entry in their trail explains the change. The append-only guarantee on the audit
trail is narrowed rather than broken: an erasure redacts the personal values
inside an event and never removes, reorders or rewrites one, so workflow values
like "status: active → paused" still read. It runs in one transaction with
ceilings, because a half-erased person is worse than a refusal that says so.
Message and note *text* is deliberately out of scope — that is the matchmaker's
call as data controller, not the platform's. The test asserts the database holds
no trace of the person afterwards *and* that each matchmaker can still open the
thread, the notes and the history through their own queries. Convex features:
mutations, indexes, queries (`packages/api/convex/admin/mutations.ts`,
`packages/api/convex/users/helpers.ts`, `apps/admin/src/pages/erasure.tsx`).

### 2026-09-21 - 0f0ad37
The candidate side became a three-column chat shell at `/app/c`, mirroring the
matchmaker workspace from the other side: their matchmakers on the left with
open invitations as badged cards, the thread in the middle, who that matchmaker
is on the right. The matchmaker is in the hash, so switching swaps the thread
without remounting the shell, and `/` now routes by whether the account owns a
matchmaker profile. The two apps share one shell and settled on two page widths
(`apps/app/src/candidate/`, `apps/app/src/shell/`).

### 2026-09-21 - d6583f8
Reached a model for the first time, through the **Convex AI Gateway** — no
provider key in the deployment, since the gateway holds the credentials.
Registered `@convex-dev/agent` for threads and message history, with the
product's own `conversations` and `messages` staying the source of truth. A
probe action proves the round trip. Convex features: actions, registered
component, typed env vars (`packages/api/convex/ai/`, `convex.config.ts`).

### 2026-09-21 - 2e7a08f
Three AI agents — conversation, candidate profile, voice profile — each with a
model and a standing instruction in an `aiAgentSettings` row, edited by a
platform admin at `/admin/ai` and audited on every change. Nothing in the code
supplies a default, so an agent nobody has configured is off rather than
quietly running on something. The admin app also got a collapsible sidebar.
Convex features: schema, mutations, queries, indexes
(`packages/api/convex/ai/`, `packages/api/convex/seed/ai/`).

### 2026-09-21 - 4ced6f7
Candidate and matchmaker **profiles** replaced the old notes table: one
document per candidate holding `facts` keyed by a registry of ~48 typed fields
and free-text `notes`, every value carrying who wrote it, when, and an agent's
proposal waiting on it. Who may write a field is declared per field, an agent
never overwrites what a person typed, and the history of a value is the audit
trail rather than a second copy of it. Convex features: schema, mutations,
queries, indexes (`packages/api/convex/candidateProfiles/`,
`packages/api/convex/profiles/`).

### 2026-09-21 - a8924ed
A notifications overlay under the bell in the header, built against a fixed
sample first so the UI could be judged before there was anything to read.
Opening it is what marks everything read; the dots are snapshotted so the list
still says which were new while it is on screen (`apps/app/src/notifications/`).

### 2026-09-21 - a5294d4
Suggestion cards above the message composer: one row per kind, one card
showing, arrows through the rest. Two of the four kinds have a source today —
the open proposals on a candidate's profile and on the matchmaker's voice — and
the same proposal is answerable here or in the candidate panel, with either
resolving it. The dev seed now writes profiles and open proposals, because a
proposal is a state only an agent can reach (`apps/app/src/chat/`,
`packages/api/convex/seed/dev/`).

### 2026-09-21 - 60041b6
The notifications panel started reading the backend. The feed is **derived on
every read, not stored**: unread conversations, recent membership changes and
waiting invitations, merged newest-first — so it cannot disagree with the
workspace beside it. Seen is not read; opening the bell sets one watermark per
account and leaves the conversation's own read marker alone. Convex features:
queries, indexes (`packages/api/convex/notifications/`).

### 2026-09-21 - 4687fbb
The reply suggester, the feature phase 2 exists for: a candidate writes, and a
few seconds later the matchmaker has one to three drafts waiting above the
composer in their own voice, each with Send, Edit and Dismiss. One agent thread
per conversation is briefed once and then told only what changed, tracked by
high-water marks on `conversations`. Drafts are rows, so they survive a reload
and going stale is a state; sending one sends an ordinary message under the
matchmaker's name. Every failure path ends with no drafts rather than a broken
composer. Convex features: actions, scheduled functions, mutations, indexes,
agent component (`packages/api/convex/replySuggestions/`).

### 2026-09-21 - ae6b79a
The **match board** and the matching algorithm behind it (`/app/mm/:username/matches`):
five columns with Rejected as a lane under them, cards produced by a nightly
cron that scores every pair in every book. **Deliberately no AI in it** — the
whole algorithm is plain code, so a matchmaker can be told exactly why two
people are on a card, and the same book scored twice gives the same answer
twice. Missing data never disqualifies, every score is symmetric because a pair
is unordered, and a score carries the coverage it was based on, so two
near-empty profiles agreeing about everything still do not reach the board. The
cron fans out one transaction per book and only ever revises its own untouched
suggestions. Convex features: crons, scheduled functions, mutations, queries,
indexes (`packages/api/convex/crons.ts`, `packages/api/convex/matches/`,
`apps/app/src/matches/`).
