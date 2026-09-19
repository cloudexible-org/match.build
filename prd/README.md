# Matchmaker OS — Product Requirements

**Working name:** matchmaker.io

The product spec, split into phases. **Phase 1 is final** and is what we build now. Later phases are drafts: their open questions must be settled before building starts.

| Phase | File | Status | What it delivers |
|---|---|---|---|
| 1 | [phase-1.md](phase-1.md) | **Final — build now** | Accounts and profiles, onboarding by invitation, in-app chat, notifications, audit trail, leaving and account deletion. A complete inbox with zero AI. |
| 2 | [phase-2.md](phase-2.md) | Draft — AI questions open | AI suggested replies, fact extraction and reconciliation, the candidate profile (facts), voice profile, thread summaries, evals. |
| 3 | [phase-3.md](phase-3.md) | Draft | Matching: match board, AI match candidates, introductions, the Discover page, reminders. |
| — | [backlog.md](backlog.md) | Unscheduled | Everything deliberately deferred. |

---

## Problem & positioning

Broad dating apps (Tinder, Bumble, Hinge) have optimised for quantity of matches and degraded on quality. A parallel market has re-emerged: independent human matchmakers, often discovered via Instagram or word of mouth, who curate a small book of candidates and introduce one or two genuinely considered matches at a premium price.

These matchmakers today run on a stack of: a marketing website with a contact form, Instagram/WhatsApp DMs, a spreadsheet or notes app, and their own memory.

**We are not building a dating app.** We are building the operating system for the matchmaker — tooling that makes one matchmaker sharper, faster, and able to carry a bigger book without losing the curation quality that is the product they sell.

**The thesis to prove:** *a matchmaker would rather run a candidate relationship through this app than through raw Instagram DMs.*

**Non-goal:** replacing matchmaker judgement with an algorithm. The AI enriches, organises, drafts, and surfaces. The human decides.

---

## Principles that hold across all phases

- **Tenant isolation is absolute.** The same real person can be a candidate of two matchmakers. Their two records are fully isolated; neither matchmaker can learn anything about the other's knowledge of that person, or that the other exists. There is no shared person entity across matchmakers.
- **Nothing is deleted.** Leaving, account deletion, rejected facts, removed notes: all change a status and write an audit event. The matchmaker keeps the full history.
- **Everything meaningful is audited**, in the same transaction as the change.
- **AI is never blocking.** Every AI feature degrades to a plain, fully functional CRM + inbox.
- **Mobile-first.** Matchmakers work from their phone.

## Glossary

| Term | Meaning | Phase |
|---|---|---|
| **User / account** | One per verified email. Has no role of its own. | 1 |
| **Matchmaker (profile)** | A tenant: one matchmaker's business and book of candidates. Owned by an account. | 1 |
| **Candidate (profile)** | A person's membership in one matchmaker's book. (Earlier drafts called this a "client".) | 1 |
| **Membership request** | A pending link between a person and a matchmaker: an invitation (phase 1) or an application (phase 3). | 1 / 3 |
| **Conversation** | Exactly one per candidate. In-app chat. | 1 |
| **Private message** | A message only the matchmaker sees, e.g. the imported prior conversation. | 1 |
| **Audit event** | An immutable record of who changed what, when, from what to what. | 1 |
| **Fact** | A discrete piece of knowledge about a candidate, with provenance and confidence. | 2 |
| **Voice profile** | A distilled description of how a matchmaker writes, used to condition AI drafts. | 2 |
| **Match** | Two candidates of the same matchmaker linked with a lifecycle and outcome. | 3 |

## Stack

[turbostack](https://github.com/cloudexible-org/turbostack) monorepo (Turborepo + pnpm, TypeScript):

| Workspace | What it is | Served at |
|---|---|---|
| `apps/app` | React + Vite SPA: home page, matchmaker workspaces, candidate chats. | `app.matchmaker.io` |
| `apps/www` | Next.js marketing site, static export. No auth; CTAs link to the app. | `www.matchmaker.io` |
| `packages/api` | Convex backend: schema, functions, agents, HTTP actions, static-hosting mounts. | `/api/…` |
| `packages/ui` | Shared shadcn/ui + Base UI components (no Radix). | — |
| `apps/e2e` | Playwright suites for both apps plus a seeded local Convex backend. | — |

Convex handles the database, functions, scheduling and HTTP actions. Convex Auth handles sign-in. Resend (via the Convex Resend component) sends the transactional email. Backend code follows the domain layout in `CLAUDE.md`.
