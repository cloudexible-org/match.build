# Hackathon log

- **Project:** match.build
- **Event:** Convex All Gas Hackathon
- **What it does:** An operating system for independent human matchmakers: invite candidates from Instagram/WhatsApp into an in-app chat, where the AI drafts replies in the matchmaker's voice and fills in a structured profile from what a candidate says, and a nightly deterministic scorer builds a match board with no model in it.
- **Live app:** https://www.match.build (app at /app/)
- **Repo:** https://github.com/cloudexible-org/match.build
- **Frontend:** Convex static hosting
- **Convex deployment:** https://api.match.build (CONVEX_CLOUD_URL custom domain)
- **Components:** @convex-dev/static-hosting (three instances: `www`, `app`, `admin`), @convex-dev/agent
- **Convex features:** schema, tables, indexes, queries, mutations, actions, internal functions, scheduled functions, crons, pagination, paginated queries, HTTP actions, realtime queries, typed env vars
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5.6-luna, through the Convex AI Gateway (`convexGateway(settings.model)`; seeded per agent into `aiAgentSettings` for all three agents, editable at /admin/ai, and token usage per model reported at /admin/usage)
- **Started:** 2026-09-19T15:37:25Z
- **Last updated:** 2026-09-21T23:05:30Z

## Log

### 2026-09-19 - ac539c4
Created the project and wrote the product spec (`PRD.md`): matchmaker and
candidate roles, a multi-tenant data model, a three-agent AI design, email
through Resend, and a build order that ships a working inbox before any AI.

### 2026-09-19 - 118de65
Scaffolded the monorepo from the turbostack template — a Vite app, a Next.js
marketing site as a static export, shared UI, Playwright. Both frontends are
served from the Convex deployment by static-hosting instances (`/` and `/app/`),
with the app's own HTTP actions under `/api/`; `pnpm ship` deploys the backend and
uploads both. Verified on a local backend only. Convex features: registered
component, HTTP actions, schema, query, mutation
(`packages/api/convex/convex.config.ts`, `packages/api/convex/http.ts`).

### 2026-09-19 - d259c6c
Dev tooling: both frontends load their env vars from Doppler under `pnpm dev`
instead of hand-copied `.env.local` files (`doppler.yaml`).

### 2026-09-19 - 2699bf6
Made the Playwright suite safe to run from several git worktrees at once: per-run
ports, a per-worktree local Convex backend under a lock so two backends never
share one database, and test servers that never point at the cloud deployment.
Verified with two worktrees running concurrently
(`apps/e2e/playwright.config.ts`, `apps/e2e/scripts/convex-local.mjs`).

### 2026-09-19 - b156647
The waitlist backend: a `waitlist` table indexed by email, a public `join`
mutation that validates, normalises and dedupes sign-ups without revealing who is
already on the list, and an internal paginated query to read them. Validation
rules are shared with the frontend; first convex-test unit tests. Convex
features: schema, index, mutation, internal query, pagination
(`packages/api/convex/waitlist/`).

### 2026-09-19 - 59b130f
Replaced the template landing page with the marketing site: a product still of a
thread with an AI-suggested reply, how it works, features, the "AI drafts, you
decide" principles, privacy, FAQ, and a waitlist form calling the `join` mutation
from the static site. Covered by Playwright specs
(`apps/www/components/landing/`).

### 2026-09-19 - f578000
Reworked the spec into a `prd/` folder of phases. Phase 1 is final: accounts that
can own several matchmaker and candidate profiles, onboarding by invitation,
in-app chat only, notifications, an append-only audit trail, and a "nothing is
deleted" rule. Email stops being a conversation channel and auth moves from Clerk
to Convex Auth; AI and matching stay drafts.

### 2026-09-19 - 3ebacab
Rewrote the marketing copy for phase 1: the invitation flow, chat in the app,
"candidates" rather than "clients", and AI framed as coming next
(`apps/www/components/landing/`).

### 2026-09-19 - d5c0997
Phase 1 step 1: sign-in with Convex Auth — an email plus a six-digit code, one
flow for sign-in and sign-up, then a name step for new accounts, keeping one
account per email and never reusing a deleted one. Codes go out through Resend
when a key is set, otherwise into an internal outbox the e2e suite reads. Also
the full phase-1 schema, tenant access helpers and an append-only audit trail
written in the same mutation as each change; `convex/http.ts` now owns the whole
site so Convex Auth's discovery document can sit at the root. Convex features:
Convex Auth, schema, indexes (including a nested-field index), queries,
mutations, internal functions, HTTP actions, typed env vars
(`packages/api/convex/auth.ts`, `users/`, `audit/`, `http.ts`).

### 2026-09-19 - ac07f1f
Dev and deployment plumbing: an interim production domain documented but not
deployed, local dev serving both sites from one origin with Vite proxying
everything outside `/app` to Next, and `auth.config.ts` reading the site URL
through the generated typed env so `convex dev` typechecks
(`apps/app/vite.config.ts`, `packages/api/convex/auth.config.ts`).

### 2026-09-19 - 18f403b
Seeded the dev deployment with six accounts, one per flow state. The seed only
adds what is missing, and refuses to run unless the site URL is on `.localhost`
with no Resend key set, so it can never touch production
(`packages/api/convex/seed/dev/`).

### 2026-09-19 - 1df4681
Production went live on the interim domain: the marketing site at `/`, the app at
`/app/`, auth discovery and HTTP actions on the same origin, a second custom
domain for the client API, and sign-in codes from the verified domain
(`README.md`, `apps/app/src/main.tsx`).

### 2026-09-19 - 7002ca9
Phase 1 step 2: any account can create a matchmaker profile and open its
workspace. Usernames are validated by shared rules and unique on a canonical key
with dots removed, so `jane.smith` is taken once `janesmith` exists. Profile and
workspace queries answer `null` alike for "not yours" and "does not exist", so a
URL cannot be used to probe for usernames. Convex features: mutations, queries,
indexes (`packages/api/convex/matchmakers/`).

### 2026-09-19 - b9fc40e
Phase 1 step 3: onboarding a candidate. One mutation writes the candidate, their
conversation, the pasted DM history as a private first message, an open invite and
the audit events, so a half-onboarded candidate cannot exist. Invite links are
HMAC-SHA256 of a per-invite nonce under a deployment secret: only the nonce and
the token's hash are stored, yet the same link can be copied again at any time
(`packages/api/convex/candidates/mutations.ts`, `invites/helpers.ts`).

### 2026-09-19 - 73d043d
Phase 1 step 4: invitations end to end. The email goes out from a scheduled
action and re-derives its token from the nonce, so no token sits in the
scheduler's stored arguments. Accepting links the account and opens the chat, and
is refused — invite left open — for the profile's owner, an existing member, or
someone who already left that book. Each invite schedules its own 30-day expiry,
hopping at most 20 days at a time to stay under the timer limit, and a matchmaker
can resend 3 a day (counted from the audit trail), change the address or revoke.
Convex features: scheduled functions, actions, mutations
(`packages/api/convex/invites/`).

### 2026-09-19 - 5c4c8b9
A third frontend: the platform admin app at `/admin/`, on the same deployment and
origin. It carries the platform-wide audit trail with its filters in the URL, and
a page that issues a sign-in code for any account so support can reproduce a
problem — shown to the admin, never emailed to the account's owner, and audited.
Every `convex/admin/` function starts with `requirePlatformAdmin`, checking the
caller's verified address against `PLATFORM_ADMIN_EMAILS`, and each filter
combination has its own index on `auditEvents`, so no filter scans the table.
Convex features: paginated queries, indexes, queries, mutations, registered
component (`packages/api/convex/admin/`, `apps/admin/`).

### 2026-09-19 - ae9e09a
Rebuilt how the e2e suite gets its data: each spec file seeds its own world in
`beforeAll`, namespaced per file and run, so no file can touch another's rows.
That reaches states the UI cannot produce quickly — an expired invite that still
has a real openable link, someone who left a month ago, an invitation already
emailed three times today — and specs sign in over HTTP through the real Convex
Auth code flow, about ten times faster than typing a code. Added
tenant-isolation, phone-layout and axe accessibility suites; 38 tests became 81
(`apps/e2e/scenario.ts`, `packages/api/convex/seed/e2e/scenario.ts`).

### 2026-09-19 - 2ec76b5
Phase 1 step 5: chat. Both sides hold one conversation and see each other's
messages without a refresh, proven by driving two browser sessions at once. One
sequence per conversation is allocated server-side so ordering cannot race, and
the matchmaker's private imported history never reaches the candidate: their
thread reads through the visibility index, which cannot return anything else.
Read markers only move forward, never past what that side can see, and are
reported only while the thread is open and the tab visible. Convex features:
paginated queries, realtime queries, indexes, mutations
(`packages/api/convex/messages/`, `apps/app/src/chat/`).

### 2026-09-19 - f7879a3
Phase 1 step 6: the candidate panel — Details, private Notes with add, edit and
soft remove, and a History tab reading the audit trail, paginated and filtered by
area. The sentences are rendered from the recorded events rather than written at
the call site, so the log and the display cannot drift. Convex features:
paginated queries, indexes, queries, mutations (`packages/api/convex/notes/`,
`audit/queries.ts`, `apps/app/src/workspace/candidate-panel.tsx`).

### 2026-09-19 - f1b40a3
The panel's three tabs became collapsible sections, and the header gained a
light/dark/system control. Writing it found that dark had never worked when
chosen: the design tokens only defined their dark values inside a
`prefers-color-scheme` block, so forcing the class did nothing on a light device.
The first test passed while the feature was broken because it only checked the
class, so it now asserts the rendered colour and scans dark mode for contrast
(`apps/app/src/theme/`, `packages/ui/src/styles/theme.css`).

### 2026-09-20 - 96f8fcd
Phase 1 step 7: leaving, and account deletion. A candidate can leave with an
optional reason and nothing is removed from the matchmaker — thread, notes and
trail stay readable, and re-inviting relinks the same record so one person keeps
one history. Deleting an account is confirmed with an emailed code kept only as a
hash, which cannot sign anyone in and is thrown away after five wrong guesses. It
marks every linked candidate `account_deleted` with one event in each matchmaker's
trail alone, so none of them learns about the others, and removes only the
account's sessions and credentials — the one hard delete in the product. Refusals
are returned rather than thrown, because a throwing mutation rolls back the very
write that counted the wrong guess. Convex features: mutations, internal
actions, scheduled functions, indexes (`packages/api/convex/users/`,
`apps/app/src/pages/account-settings.tsx`).

### 2026-09-20 - 2d0f09c
Phase 1 step 8, the last of phase 1: notifications. A message you don't open
reaches you by push after ~30 seconds and by email after ~5 minutes; one you do
open reaches you not at all. Nothing is sent when a message is written — a job is
scheduled, and on firing re-reads the conversation and asks whether the read
marker has passed the message. One row per (conversation, recipient, channel), so
a burst has one pending job per channel and a later message rides on it, and
notifications say who wrote and never what, because they are read on lock
screens. Web push is RFC 8291 encryption and an RFC 8292 VAPID JWT written on Web
Crypto rather than the web-push package, so sending stays in Convex's own runtime
instead of a `"use node"` action, and the RFC's worked example is replayed byte for
byte in the tests — the only way to catch a payload a push service accepts and a
browser silently drops. The app also became installable. Convex features: scheduled functions, mutations, internal actions, indexes
(`packages/api/convex/notifications/`, `apps/app/src/notifications/`).

### 2026-09-21 - 4d72d10
Renamed the product from Matchmaker to match.build across the apps, the specs and
the copy, along with the dev hostname and the Doppler project. "Matchmaker" stays
where it means the *role*, so this touched the product name only.

### 2026-09-21 - 360b65b
Erasure requests (`/admin/erasure`), for the one place where the "nothing is
deleted" rule and a right-to-erasure request genuinely conflict: it erases the
**person**, not the record. A name, address and handles go everywhere they appear
— the account, every matchmaker's record of them, and the values inside the audit
trail — while every conversation, message, note and event stays, so each
matchmaker keeps a full history of their work attached to a candidate nobody can
be identified from. The append-only guarantee is narrowed rather than broken: an
erasure redacts the personal values inside an event and never removes, reorders or
rewrites one. It runs in one transaction with ceilings, because a half-erased
person is worse than a refusal that says so, and message and note *text* is out of
scope — the matchmaker's call as data controller. Convex features:
mutations, indexes, queries (`packages/api/convex/admin/mutations.ts`,
`apps/admin/src/pages/erasure.tsx`).

### 2026-09-21 - 0f0ad37
The candidate side became a three-column chat shell at `/app/c`, mirroring the
matchmaker workspace from the other side: their matchmakers on the left with open
invitations as badged cards, the thread in the middle, who that matchmaker is on
the right. The matchmaker is in the hash, so switching swaps the thread without
remounting the shell, and `/` routes by whether the account owns a matchmaker
profile (`apps/app/src/candidate/`, `apps/app/src/shell/`).

### 2026-09-21 - d6583f8
Reached a model for the first time, through the **Convex AI Gateway** — no
provider key in the deployment, since the gateway holds the credentials.
Registered `@convex-dev/agent` for threads and message history, with the
product's own `conversations` and `messages` staying the source of truth. Convex
features: actions, registered component, typed env vars
(`packages/api/convex/ai/`).

### 2026-09-21 - 2e7a08f
Three AI agents — conversation, candidate profile, voice profile — each with a
model and a standing instruction in an `aiAgentSettings` row, edited by a platform
admin at `/admin/ai` and audited on every change. Nothing in the code supplies a
default, so an agent nobody has configured is off rather than quietly running on
something. Convex features: schema, mutations, queries, indexes
(`packages/api/convex/ai/`, `seed/ai/`).

### 2026-09-21 - 4ced6f7
Candidate and matchmaker **profiles** replaced the old notes table: one document
per candidate holding `facts` keyed by a registry of ~48 typed fields plus
free-text `notes`, every value carrying who wrote it, when, and any agent's
proposal waiting on it. Who may write a field is declared per field, an agent
never overwrites what a person typed, and a value's history is the audit trail
rather than a second copy of it. Convex features: schema, mutations, queries,
indexes (`packages/api/convex/candidateProfiles/`, `profiles/`).

### 2026-09-21 - a8924ed
A notifications overlay under the bell, built against a fixed sample first so the
UI could be judged before there was anything to read. Opening it marks everything
read; the dots are snapshotted so the list still says which were new while it is
on screen (`apps/app/src/notifications/`).

### 2026-09-21 - a5294d4
Suggestion cards above the composer: one row per kind, one card showing, arrows
through the rest. Two of the four kinds have a source today — the open proposals
on a candidate's profile and on the matchmaker's voice — and a proposal is
answerable here or in the candidate panel, either resolving it. The dev seed now
writes proposals, a state only an agent can otherwise reach
(`apps/app/src/chat/`, `packages/api/convex/seed/dev/`).

### 2026-09-21 - 60041b6
The notifications panel started reading the backend. The feed is **derived on
every read, not stored** — unread conversations, recent membership changes and
waiting invitations, merged newest-first — so it cannot disagree with the
workspace beside it. Seen is not read: opening the bell sets one watermark per
account and leaves the conversation's own read marker alone. Convex features:
queries, indexes (`packages/api/convex/notifications/`).

### 2026-09-21 - 4687fbb
The reply suggester, the feature phase 2 exists for: a candidate writes, and a few
seconds later one to three drafts wait above the composer in the matchmaker's own
voice, each with Send, Edit and Dismiss. One agent thread per conversation is
briefed once and then told only what changed, tracked by high-water marks on
`conversations`. Drafts are rows, so they survive a reload and going stale is a
state, and every failure path ends with no drafts rather than a broken composer.
Convex features: actions, scheduled functions, mutations, indexes, agent component
(`packages/api/convex/replySuggestions/`).

### 2026-09-21 - ae6b79a
The **match board** and the matching algorithm behind it
(`/app/mm/:username/matches`): cards produced by a nightly cron that scores every
pair in every book, in five columns at this point — `33a5abc` and `129812e` below
reshape them. **Deliberately no AI in it**, so a matchmaker can be told exactly
why two people are on a card and the same book scored twice gives the same answer
twice. Missing data never disqualifies, every score is symmetric because a pair is
unordered, and a score carries the coverage it was based on, so two near-empty
profiles agreeing about everything still do not reach the board. The cron fans out
one transaction per book and only ever revises its own untouched suggestions.
Convex features: crons, scheduled functions, mutations, queries, indexes
(`packages/api/convex/crons.ts`, `matches/`, `apps/app/src/matches/`).

### 2026-09-21 - 74ef310
An AI switch per conversation: drafted replies can be turned off for one candidate
and back on, and absent means on, so only the exception is stored. Off cancels the
pending job, stales the drafts on offer and deletes the agent thread through the
component's own API, so on again starts from nothing rather than carrying on a
sentence from a fortnight ago. The summariser is cut from v1 — the live window
goes 20 → 50 messages and is the whole of what the agent ever sees. Convex
features: mutations, queries, scheduled functions, schema, typed env vars, agent
component (`packages/api/convex/replySuggestions/`).

### 2026-09-21 - c1abe5a
Matches moved into the candidate panel as its first section, drawing the same card
the board draws with the stage as a badge, since a panel has no columns to say it
with. `matches.queries.forCandidate` reads `by_candidateAId` and `by_candidateBId`
both, because a pair is keyed by id order and one read would miss whichever match
puts this person second. Convex features: queries, indexes
(`packages/api/convex/matches/queries.ts`,
`apps/app/src/workspace/candidate-matches.tsx`).

### 2026-09-21 - 33a5abc
The board drops to three columns, **superseding the five above**: `Reviewing` and
`Mutual interest` described the matchmaker rather than the match, so unseen-ness
became a dot on the card, and `Suggested` became `Proposed` because a matchmaker's
own pairing lands there too. A rejection and a wedding are the same event —
somebody saying this is over and saying what happened — so the Rejected lane is
gone and one `closed` state carries an outcome, who ended it (including **both of
them**, the commonest way an introduction quietly ends), and a note. Nothing ages
out any more, because nothing needs hiding. Convex features: schema, mutations,
queries, indexes (`packages/api/convex/matches/`, `apps/app/src/matches/board.tsx`).

### 2026-09-21 - f0ee80a
Tooling, not product: demo clips of the working app for the pitch deck.
`pnpm capture:demo` drives the app through a real feature and writes timed frames
plus a manifest; `pnpm render:demo` turns those into an mp4, a GIF and a poster.
Frames and a timeline rather than a recording, because a recording's pacing is the
run's pacing — every Convex round trip lands in the clip as dead air. To share the
test world without sharing the suite, `apps/e2e` split into `tooling/harness`
(backend, seed, sign-in, page objects), `tooling/e2e` (the specs) and
`tooling/marketing` (the captures). All 166 e2e specs pass unchanged (`tooling/`,
`docs/demo-videos.md`).

### 2026-09-21 - e3cffdd
A drafted reply takes the whole row above the composer, its arrows moved inside the
card's own header beside the `‹ 1/2 ›` counter. The header's two ways into settings
now say which is which — **Account settings** and **Profile settings** — and below
`md` the link set folds into a hamburger rather than some links being silently
hidden and unreachable at 380px; the bell and the theme stay out of the menu
(`apps/app/src/components/app-header.tsx`, `packages/ui/src/components/menu.tsx`).

### 2026-09-21 - ca36424
Made the PRD say what got built — the reply suggester had been running for three
days while seven sections still called it proposed. The pass turned up one real
defect: `@convex-dev/agent` was admitted on the single condition that an erasure
could reach its tables, which `ctx.db` cannot see, and the suggester had started
creating a thread per conversation without `eraseAccount` learning how. Recorded
in the file and in `convex.config.ts` rather than quietly fixed (`prd/`).

### 2026-09-21 - 4a5e92d
A dev seed with a book worth matching: sixteen filled-in profiles and a board of
twenty-one cards, including thin pairs and pairs the filters refuse outright. The
seed runs the *real* scoring pass rather than writing cards directly — a board the
nightly run could never have produced is one you cannot learn anything from — then
moves cards into every state a card can be in, and pairs two people by hand so the
manual badge is on the board. Convex features: mutations, scheduled functions
(`packages/api/convex/seed/dev/`).

### 2026-09-21 - a18040a
The marketing site stops promising what already shipped: drafted replies and the
board were still in the roadmap callout days after each went out, and are feature
cards now, with a fourth step in *How it works* for the board. A test pins that
from both sides — shipped AI must be a card, unshipped AI must be in the callout —
because the old test asserted the reverse and passed happily for two build steps
after that stopped being true (`apps/www/`,
`tooling/e2e/specs/www/landing.spec.ts`).

### 2026-09-21 - 9fe1faa
**The last two of the three agents now write.** A candidate says something about
themselves and a few seconds later it is on their profile, or waiting above the
composer as a proposal with their own words beside it; every twentieth message a
matchmaker sends, a voice agent reads what they have written and offers a
description of how they write. The noticing rides along with the drafting call, so
one generation does both, and **an observation with no quote is dropped** — the
quote is what a matchmaker checks a proposal against. Whether a fact is written
straight in or only proposed is the field's policy, never the model's choice. The
same change closes the erasure gap logged above: `eraseAccount` deletes each
conversation's agent thread through the component's own API, proven by a test that
seeds real threads in the component's tables. Convex
features: actions, scheduled functions, mutations, queries, schema, agent
component (`packages/api/convex/candidateProfiles/actions.ts`,
`matchmakerProfiles/`, `admin/mutations.ts`).

### 2026-09-21 - a3cbec6
Board follow-ups. A card is marked seen by an explicit button, because unseen cards
sort first and marking on read reordered a card out from under whoever was reading
it, and `seed:dev:reset` empties the board for a fresh seed — the only thing in the
product that deletes rows, and refused anywhere but a dev deployment. The board
also became the page, filling the frame and scrolling inside itself, after two
separate causes of a page that scrolled into nothing: a minimum height on columns
that had already given up their slack, and an `sr-only` label on a card with no
positioned ancestor, which made the *document* its containing block so no scroll
container clipped it. Convex features: mutations (`apps/app/src/matches/`,
`packages/api/convex/seed/dev/mutations.ts`).

### 2026-09-21 - 3ead424
The conversation header's controls say what they are: the per-conversation switch
for drafted replies reads **AI**, and **Details** is gone from `lg` up, where the
panel it opened already sits alongside (`apps/app/src/chat/suggestions-toggle.tsx`).

### 2026-09-21 - 129812e
Closed became a column of its own, hidden until it is asked for, and the way in is
the count — "14 closed · 3 together" — which moved from under the board up beside
the other controls, so a closed card is read exactly where a live one is. It is
deliberately **not** a drop target: closing records what happened, so a column
that lit up under a dragged card and then refused it would be a column that lied
(`apps/app/src/matches/board.tsx`).

### 2026-09-21 - 6f2685f
The AI control became Base UI's `Switch`, **superseding the toggle above**,
because a ghost button wearing `role="switch"` by hand had the semantics of a
switch without the affordance of one. The wrapping label is load-bearing: Base UI
points `aria-labelledby` at it, so the computed name is "Drafted replies" and the
role announces on or off by itself, where the old name "Turn off drafted replies"
was an instruction (`packages/ui/src/components/switch.tsx`).

### 2026-09-21 - bdfada0
**The candidate panel reads as a record, not a form.** A fact was three lines with
a permanent row carrying Edit and Clear; it is one line now, the whole row being
the edit control, and Details stopped being 480px of standing form with a *Save
details* button. Both sections render the same rows (`panel-record.tsx`), so the
next section added inherits the answer instead of inventing a third one.
Provenance is marked only where it carries information: a value a model touched
gets a visible ✦. History is grouped by day, gathering consecutive runs rather
than bucketing by key since paging appends older events, and the edit pencil is
always drawn now, faintly, because hover-only on a phone means never
(`apps/app/src/workspace/`).

### 2026-09-21 - 4dbd315
**What the AI is costing, at `/admin/usage`.** Every call that leaves this
deployment for a model records its tokens, added up by day, by agent, by model and
by matchmaker over a window of 1, 7 or 30 days. Tokens and money are kept apart,
because the gateway reports tokens and no price: every figure in dollars is
arithmetic over a rate somebody typed in, **an unpriced model has no cost rather
than a cost of zero**, and the page says how many generations a total is missing.
A generation is priced when it happens and stays priced, so correcting a rate
cannot rewrite last month. `recordUsage` never throws and runs before the model's
text is parsed, since the tokens were spent either way. Convex features: schema, indexes, mutations,
queries, actions (`packages/api/convex/aiUsage/`,
`apps/admin/src/pages/ai-usage.tsx`).

### 2026-09-21 - f1b767b
A mark of our own — two overlapping circles with the ground they share filled in,
because a match is what two people have in common — and `pnpm build:icons` draws
every app's icons from four SVGs in `assets/brand/`. All three apps had been
shipping the template's placeholder, and `apps/admin` had no favicon at all, so an
admin tab and a candidate tab looked identical in a tab strip (`assets/brand/`,
`scripts/build-icons.mjs`).

### 2026-09-21 - 2b52ddb
A profile keeps a **date of birth and no longer an age**: an age is true for one
year and nothing stored beside it knows which year that was, so a profile written
last spring quietly matched on a number that had gone wrong. The agent can only
propose a birth date and is told never to work one back from an age it heard; an
age a candidate mentions goes to a note, in prose, with when they said it. The
matcher reads the birth date only, so a pair with none between them scores nothing
on age rather than being judged on a stale number. Both agents are also told what
day it is, in the per-turn instruction rather than the opening brief, because a
thread outlives the day it was opened. Convex features: actions,
mutations, shared validation rules
(`packages/api/convex/candidateProfiles/rules.ts`, `ai/rules.ts`,
`matches/rules.ts`).
