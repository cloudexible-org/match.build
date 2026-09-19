# Phase 1 — The inbox

**Status:** Final — build now.
**Goal:** a matchmaker can onboard candidates from Instagram/WhatsApp into the app and run the relationship there, with no AI at all. If phase 1 isn't better than DMs on its own, AI won't save it.

**Out of this phase:** everything AI (suggested replies, facts, voice profile — see [phase-2.md](phase-2.md)), matching and the Discover page ([phase-3.md](phase-3.md)), and everything in [backlog.md](backlog.md).

---

## 1. Accounts and profiles

**Account (user).** One per email address. Sign-up asks only for a **name** and an **email**, verified with a one-time code (§8.3). An account has no role of its own: roles live on the profiles it owns.

**Anyone can create a matchmaker profile.** There is no waitlist gate or approval step.

**Profiles.** An account can own any number of each:

| Profile | What it is | Created by | URL |
|---|---|---|---|
| **Matchmaker profile** | A tenant: one matchmaker's business and book of candidates. | The account holder, from the home page. Asks for a **username** (§1.1) and display name. | `app.matchmaker.io/mm/<username>` |
| **Candidate profile** | A person's membership in *one* matchmaker's book. | The matchmaker, when they onboard someone (§3.1). Linked to an account when the invitation is accepted. | `app.matchmaker.io/c/<matchmakerUsername>` |

- The same account can be a candidate of several matchmakers, and a matchmaker at the same time.
- An account is a candidate of a given matchmaker **at most once**. That is why the candidate URL is keyed by the matchmaker's username, and candidates never need a username of their own.
- **Multiple matchmaker profiles** per account are allowed by the data model and the backend. The **UI** allows only one: the "Create matchmaker profile" button is hidden once the account owns one. This is deliberately **not** enforced server-side.
- A candidate sees a minimal chat-only interface: no visibility into other candidates, the matchmaker's notes, private messages or audit trail.

### 1.1 Username rules

Modelled on Gmail usernames. Validation lives in `convex/matchmakers/rules.ts` so the app and the server check identically.

- **Length:** 6–30 characters.
- **Characters:** letters `a–z`, digits `0–9` and periods `.`. Input is case-insensitive and stored lowercase.
- **Periods:** cannot be the first or last character, and cannot appear twice in a row (`..`).
- **Must contain at least one letter.**
- **Periods are ignored for uniqueness**, as in Gmail: `jane.smith` and `janesmith` are the same username. Store the chosen form (`username`, used in URLs and display) and a canonical key (`usernameKey`, dots removed) that carries uniqueness. A URL using a different dot placement redirects to the chosen form.
- **Reserved names** (§1.2) are rejected, compared on the canonical key.
- **Immutable from the UI.** The username is the URL (and later possibly an email address), so renaming would break links. The **display name** (1–60 characters) is freely editable.

### 1.2 Reserved usernames

Compared against the canonical key (dots removed). Names under six characters (`admin`, `abuse`, `api`, `www`, …) are already invalid by length. The list protects future `<username>@` email addresses and prevents impersonation of the platform; URL collisions are not a concern because matchmaker URLs are namespaced under `/mm/`.

- **Email & infrastructure:** `postmaster`, `hostmaster`, `webmaster`, `mailerdaemon`, `noreply`, `donotreply`, `mailer`, `bounce`, `bounces`, `invite`, `invites`, `invitation`, `invitations`, `notify`, `notification`, `notifications`, `unsubscribe`, `newsletter`, `security`
- **Support & business:** `support`, `helpdesk`, `contact`, `feedback`, `privacy`, `compliance`, `billing`, `payments`, `invoices`, `account`, `accounts`, `marketing`, `report`, `reports`, `safety`, `trustandsafety`
- **Authority & impersonation:** `matchmaker`, `matchmakers`, `matchmakerio`, `matchmakerapp`, `matchmakeros`, `official`, `verified`, `admins`, `administrator`, `moderator`, `moderators`, `system`, `sysadmin`, `superuser`
- **Product words:** `candidate`, `candidates`, `client`, `clients`, `matches`, `discover`, `explore`, `search`, `messages`, `dashboard`, `onboarding`, `workspace`, `profile`, `profiles`, `settings`, `username`
- **Auth & app plumbing:** `signin`, `signup`, `signout`, `logout`, `register`, `status`, `health`, `static`, `assets`, `public`
- **Placeholders:** `anonymous`, `undefined`, `nobody`, `everyone`

Extend the list rather than blocking substrings: a substring rule would reject legitimate names like `janethematchmaker`.

---

## 2. Home page

Shown after sign-in at `app.matchmaker.io/`. Sections:

1. **Invitations** — pending invites for this account's verified email. Hidden when empty.
2. **Your matchmaker profiles** — with a **Create matchmaker profile** button, hidden once one exists.
3. **Your matchmakers** — candidate profiles with `membership: "joined"`, one per matchmaker, with unread indicators.

Empty state for a new account: a prompt to create a matchmaker profile, plus a line for candidates: "Waiting for an invitation? Ask your matchmaker for your invite link."

---

## 3. Flows

### 3.1 Onboarding a candidate

1. A candidate reaches out to the matchmaker on Instagram or WhatsApp. There is some back and forth off-platform. **We do not try to own this step.**
2. The matchmaker decides it is time to onboard them. In their workspace they click **Onboard**.
3. The form asks for:
   - **Email address** — required. Trimmed and lowercased.
   - **Name** — optional.
   - **Social handles** — optional, zero or more `{ platform, handle }` pairs. Platforms: Instagram, WhatsApp, TikTok, Facebook, X, LinkedIn, Other. Handles are normalised per platform (leading `@` stripped; WhatsApp stored as an E.164 phone number).
   - **Existing conversation** — optional free text. Usually the pasted DM history.
4. On submit, in one mutation:
   - a `candidates` row is created with `membership: "invited"` and `status: "active"`;
   - its `conversations` row is created;
   - the existing conversation, if any, is stored as a **private message** (`visibility: "matchmaker"`, `source: "imported"`) at the start of the thread;
   - the candidate row gets an open `invite` (a fresh link token's hash and its expiry);
   - the invitation email is scheduled (§8);
   - audit events are written for the candidate and the invite (§5).
5. The matchmaker lands in the new candidate's conversation. They can work immediately: read the imported history, add notes. Nothing in the thread is visible to anyone else yet.
6. The conversation shows a **Copy invite link** button, so the matchmaker can also paste the link into the DM.

**If the matchmaker already has a candidate with this email** (in any membership state), block the submit and link to the existing candidate, where they can re-invite if needed.

**Privacy constraint:** the form must behave identically whether or not the email already belongs to an account. The matchmaker must not be able to learn who is on the platform. The same applies to inviting your own email: allowed by the UI's behaviour, but see §3.2 on accepting.

### 3.2 Accepting an invitation

Two ways in, both ending at the same accept screen:

- **From the home page.** When a signed-in account's verified email matches a pending invite, it appears under **Invitations**.
- **From the invite link** `app.matchmaker.io/invite/<token>`. Signed-out visitors go through sign-up/sign-in and return to the link. **The token works for any signed-in account**, even if its email differs from the one the matchmaker typed — this rescues typos and second email addresses. The token is single-use.

The accept screen shows the matchmaker's display name, a short privacy notice (§9.3), and **Accept** / **Decline**. On accept:

- the candidate record's `userId` is set to the accepting account and its `membership` becomes `joined`;
- the candidate's `invite` is cleared, so the link stops working; who accepted and when is recorded in the audit trail;
- the candidate is taken to `/c/<matchmakerUsername>` with the conversation open;
- the matchmaker is notified, and sees the accepting account's name and email. If it differs from the invited email, the candidate panel says so ("Accepted as other@example.com").

The accept fails with a clear message, and the invite stays pending, if the accepting account is already a joined candidate of that matchmaker, or owns that matchmaker profile.

**Invite management by the matchmaker**, while an invite is open: **resend** the email (rate-limited, 3 per day), **copy** the link, **revoke** it, or **change the email** (issues a new token, which replaces the old one and so invalidates the old link). Invites **expire after 30 days**: a scheduled job clears the candidate's `invite`, and the matchmaker can reissue. There is only ever one open invite per candidate, stored on the candidate row itself.

**Decline** clears the `invite` and sets the candidate's `membership` to `declined`. The candidate stays in the matchmaker's book with a "Declined" marker, so the matchmaker can follow up off-platform and re-invite.

Every step above is audited (§5).

### 3.3 Conversation

- Both parties chat in real time (Convex subscriptions; no refresh).
- **Private messages** (the imported history, system notes) appear in the matchmaker's timeline with an **"Only visible to you"** badge and a distinct treatment. They are never returned by any candidate-facing function and never trigger notifications.
- Messages can't be edited or deleted in phase 1.
- The composer is available only while `membership` is `joined`. Before that (invited, declined) and after it (left, account deleted), the matchmaker can still read the thread and add notes.

### 3.4 Leaving a matchmaker

In the candidate chat's menu: **Leave <matchmaker display name>**, with a confirmation and an optional reason. The confirmation says plainly that the matchmaker keeps a copy of the conversation.

- The candidate record's `membership` becomes `left`; `membershipChangedAt` and `leaveReason` are stored; an audit event is written.
- The candidate loses access to that conversation. It disappears from their home page.
- For the matchmaker nothing is removed: messages, notes and audit trail stay fully readable. A badge at the top of the conversation and at the end of the timeline says **"<Name> left on <date>"**. The composer is replaced by that notice. Notes and candidate details remain editable — they are the matchmaker's own records.
- The matchmaker can **re-invite**. Accepting re-links the same candidate record (`membership` back to `joined`), so the history continues in one thread.

### 3.5 Deleting an account

In `/settings`: **Delete account**, confirmed with a fresh one-time code. The confirmation says plainly that matchmakers keep their copies of past conversations.

- Every candidate record linked to the account gets `membership: "account_deleted"` and an audit event — one per matchmaker, each written only into that matchmaker's trail, so no matchmaker learns about the others.
- Each matchmaker sees the same read-only treatment as for leaving, with the badge **"<Name> deleted their account on <date>"**.
- The `users` row is kept but marked `deletedAt`; the account's sessions and sign-in credentials are removed so it can no longer sign in. Signing up again with the same email creates a **new** account, which does not see the old conversations. A matchmaker can re-invite it, re-linking the candidate record to the new account.
- **Restriction:** an account that owns a matchmaker profile cannot be deleted from the UI. Closing a matchmaker profile is in the [backlog](backlog.md).

### 3.6 Candidate experience

- Sign up with name and email; verify with a one-time code.
- Home page shows invitations and the matchmakers they have joined.
- One chat window per matchmaker at `/c/<matchmakerUsername>`. No notes, no private messages, no audit trail, no other candidates.
- **Leave** from the chat menu; **Delete account** from settings.

---

## 4. UI

`app.matchmaker.io` routes:

| Route | View |
|---|---|
| `/` | Home (§2) |
| `/sign-in` | Sign-up / sign-in (name + email, then one-time code) |
| `/invite/:token` | Invitation accept / decline |
| `/mm/new` | Create matchmaker profile |
| `/mm/:username` | Matchmaker workspace |
| `/mm/:username/c/:candidateId` | Matchmaker workspace with a conversation open |
| `/mm/:username/settings` | Matchmaker profile settings (display name, business name) |
| `/c/:matchmakerUsername` | Candidate chat with that matchmaker |
| `/settings` | Account settings: name, notifications, delete account |

The route only selects a workspace; access is checked on the server for every call (§9.2).

### 4.1 Matchmaker workspace

Three-column, mobile-first. On narrow viewports **only the centre column is visible by default**; left and right collapse behind menu affordances. The centre column must be fully usable at 380px.

**Left — conversation list.** Candidates sorted by recency, with unread indicators and membership markers (Invited, Declined, Left, Account deleted). Filter by status (active / paused / archived; default active). Search by name, email or handle. **Onboard** button.

**Centre — conversation.**
- The message timeline. Private messages carry the **"Only visible to you"** badge.
- Membership badges: "Invited · not joined yet", "Declined", "<Name> left on <date>", "<Name> deleted their account on <date>".
- For a pending invite: a banner with **Copy invite link**, **Resend**, **Change email**, **Revoke**. For left / declined / deleted: **Re-invite**.
- Composer, only while `membership` is `joined`.

**Right — candidate panel (collapsible).** Tabs:
- **Details** (default) — name, email, social handles (editable); membership and invitation state; status (active / paused / archived).
- **Notes** — private free-text notes; add, edit, remove (soft).
- **History** — the audit trail (§5.2).

`paused` and `archived` are the matchmaker's own labels. In phase 1 they only affect list filtering; they don't restrict messaging.

### 4.2 Candidate chat

A single chat window headed by the matchmaker's display name. Only `visibility: "everyone"` messages. Composer. Menu with **Leave**. A link back to the home page when the account has more than one profile.

---

## 5. Audit trail

### 5.1 What gets recorded

Every change to state the matchmaker cares about, by anyone:

| Area | Actions |
|---|---|
| Candidate details | `candidate.created` (onboarded); `candidate.details_changed` (name, email, social handles); `candidate.status_changed` (paused, archived, reactivated) |
| Invitations | `invite.created`, `invite.sent`, `invite.resent`, `invite.email_changed`, `invite.revoked`, `invite.expired`, `invite.accepted` (with the accepting account), `invite.declined` |
| Membership | `membership.left` (with reason), `membership.account_deleted`, `membership.reinvited` |
| Notes | `note.created`, `note.edited`, `note.removed` |
| Candidate's own account | `account.name_changed` — fanned out as one event per linked candidate record |
| Matchmaker profile | `matchmaker.created`, `matchmaker.updated` (display name, business name). Shown in profile settings, not a candidate's trail. |

Phase 2 adds fact and voice-profile actions to the same log.

**Not recorded** (mundane, or already a record of its own): messages sent or received, read markers, notifications, sign-ins.

### 5.2 Viewing it

The **History** tab lists a candidate's events newest first, paginated. Each entry shows:

- **When.**
- **Who:** "You", the candidate ("Jane"), or "System" (e.g. invite expiry).
- **What:** a readable sentence ("Changed email from *jane@gmial.com* to *jane@gmail.com*"), with before → after values where there are any.
- **Why**, when known: the reason given for leaving.

Filters: All · Details · Invitations & membership · Notes.

### 5.3 Guarantees

- **Written in the same mutation as the change.** Every function that changes audited state calls one helper, `recordAudit(ctx, event)` in `convex/audit/helpers.ts`, inside its own transaction. A change without its audit event is impossible; nothing audits later via the scheduler.
- **Append-only.** No function updates or deletes an audit event.
- **Tenant-scoped.** Every candidate event carries `matchmakerId` and `candidateId`, and only that matchmaker can read it. Candidates never see the audit trail.
- **Action names are a fixed list** in `convex/audit/rules.ts`, with a renderer that turns each action into the readable sentence.
- Implemented as a regular domain (`convex/audit/`), not an isolated Convex component: the helper must write in the caller's transaction and be queried alongside candidate data.

---

## 6. Data model

**Tenancy key.** Every row that belongs to a matchmaker carries `matchmakerId`. Every function that reads or writes such rows first establishes, on the server, that the caller may access that tenant (§9.2). Scheduled jobs are `internal`, receive `matchmakerId` as an argument, and are only scheduled by functions that already checked it.

**The schema below is the design; `packages/api/convex/schema.ts` is the source of truth.** The code differs in small ways: index names follow Convex's `by_<field>_and_<field>` convention, creation times use the built-in `_creationTime` instead of `createdAt`, and audit actors have a third role, `account`, for changes a person makes to their own account.

**Nothing is hard-deleted.** No function calls `ctx.db.delete` on these tables. Removed notes get `removedAt`; deleted accounts get `deletedAt`; departed candidates get a `membership` value. The only exception is auth plumbing (sessions and credentials of a deleted account, §3.5).

```ts
// convex/schema.ts — phase 1
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const socialPlatform = v.union(
  v.literal("instagram"),
  v.literal("whatsapp"),
  v.literal("tiktok"),
  v.literal("facebook"),
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("other"),
);

export default defineSchema({
  ...authTables, // sessions, accounts, verification codes, …

  // Overrides authTables.users to add soft deletion. Keeps Convex Auth's fields.
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    deletedAt: v.optional(v.number()), // set on account deletion; the row is never removed
  }).index("email", ["email"]),

  matchmakers: defineTable({
    ownerUserId: v.id("users"),
    username: v.string(),            // chosen form, lowercase, may contain dots; used in URLs
    usernameKey: v.string(),         // canonical form, dots removed; unique
    displayName: v.string(),
    businessName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_usernameKey", ["usernameKey"]),

  // A person's standing with ONE matchmaker: the matchmaker's record of them.
  // Not the person (that's `users`). Exists before the person has an account;
  // linked to a user once they join. Also carries the open invitation, if any.
  candidates: defineTable({
    matchmakerId: v.id("matchmakers"),
    userId: v.optional(v.id("users")), // set when an invitation is accepted
    name: v.optional(v.string()),      // the matchmaker's label; falls back to the user's name
    email: v.string(),                 // as invited, trimmed + lowercased
    socialHandles: v.array(v.object({ platform: socialPlatform, handle: v.string() })),
    // The person's side: are they connected to this matchmaker?
    // Phase 3 adds "applied" for Discover-page applications.
    membership: v.union(
      v.literal("invited"),
      v.literal("declined"),
      v.literal("joined"),
      v.literal("left"),
      v.literal("account_deleted"),
    ),
    membershipChangedAt: v.number(),
    leaveReason: v.optional(v.string()),
    // The open invitation. Absent once accepted, declined, revoked or expired.
    invite: v.optional(v.object({
      tokenHash: v.string(),                 // SHA-256 of the link's token; the raw token is never stored
      expiresAt: v.number(),
      lastSentAt: v.optional(v.number()),    // drives the resend rate limit
    })),
    // The matchmaker's side: their own workflow label, independent of membership.
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
    createdAt: v.number(),
  })
    .index("by_matchmaker_status", ["matchmakerId", "status"])
    .index("by_matchmaker_email", ["matchmakerId", "email"])
    .index("by_user_matchmaker", ["userId", "matchmakerId"])
    .index("by_email_membership", ["email", "membership"])  // home page invitations
    .index("by_invite_tokenHash", ["invite.tokenHash"]),     // invite links

  conversations: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    lastSeq: v.number(),                  // last message of any visibility
    lastPublicSeq: v.number(),            // last message visible to the candidate
    lastMessageAt: v.number(),
    matchmakerLastReadSeq: v.number(),
    candidateLastReadSeq: v.number(),
  })
    .index("by_matchmaker_lastMessageAt", ["matchmakerId", "lastMessageAt"])
    .index("by_candidate", ["candidateId"]),

  messages: defineTable({
    matchmakerId: v.id("matchmakers"),
    conversationId: v.id("conversations"),
    seq: v.number(),                      // monotonic within conversation, allocated from conversations.lastSeq
    author: v.union(v.literal("matchmaker"), v.literal("candidate"), v.literal("system")),
    authorUserId: v.optional(v.id("users")),
    visibility: v.union(v.literal("everyone"), v.literal("matchmaker")),
    source: v.union(
      v.literal("typed"),
      v.literal("imported"),              // pasted prior conversation from onboarding
      v.literal("system"),
    ),
    body: v.string(),
    sentAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "seq"])
    .index("by_conversation_visibility", ["conversationId", "visibility", "seq"]),

  notes: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    body: v.string(),
    removedAt: v.optional(v.number()),    // "removed" in the UI; the row stays
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_candidate", ["candidateId"]),

  // Append-only audit trail (§5). Written only through `recordAudit(ctx, …)`.
  auditEvents: defineTable({
    matchmakerId: v.optional(v.id("matchmakers")), // absent only for account-level events
    candidateId: v.optional(v.id("candidates")),
    actor: v.union(
      v.object({
        type: v.literal("user"),
        userId: v.id("users"),
        role: v.union(v.literal("matchmaker"), v.literal("candidate")),
      }),
      v.object({ type: v.literal("system"), job: v.string() }), // e.g. "invite_expiry"
      // phase 2 adds { type: "agent", agent, model }
    ),
    action: v.string(),              // from the fixed list in convex/audit/rules.ts
    entityTable: v.string(),         // "candidates" (incl. invitations) | "notes" | "matchmakers" | "users"
    entityId: v.string(),
    changes: v.optional(v.array(v.object({
      field: v.string(),
      before: v.optional(v.string()), // JSON-encoded
      after: v.optional(v.string()),
    }))),
    relatedEntityId: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_candidate_createdAt", ["candidateId", "createdAt"])
    .index("by_matchmaker_createdAt", ["matchmakerId", "createdAt"])
    .index("by_entity", ["entityTable", "entityId"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  notificationSettings: defineTable({
    userId: v.id("users"),
    emailEnabled: v.boolean(),
    pushEnabled: v.boolean(),
  }).index("by_user", ["userId"]),

  // One row per (conversation, recipient, channel) notification attempt. Used to coalesce and throttle.
  notifications: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    channel: v.union(v.literal("push"), v.literal("email")),
    triggerSeq: v.number(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("sent"),
      v.literal("skipped_seen"),
      v.literal("skipped_disabled"),
      v.literal("failed"),
    ),
    scheduledFor: v.number(),
    sentAt: v.optional(v.number()),
  }).index("by_conversation_user_channel", ["conversationId", "userId", "channel"]),
});
```

**Modelling notes:**

- **Why the candidate row exists before acceptance.** The matchmaker needs to work on a candidate (read the imported history, write notes) before the person has signed up. The invitation is only the link between that record and an account, so it lives on the candidate row rather than in a table of its own: there is never more than one open invite per candidate, and the audit trail already keeps the history of every invite sent, resent, revoked, expired, accepted or declined. Phase-3 applications fit the same row: a candidate with `membership: "applied"` and `userId` already set, which the matchmaker approves (`joined`) or declines.
- **Two fields for candidate state.** `membership` is the person's side; `status` is the matchmaker's workflow. A candidate who left can still be archived; keeping them separate avoids a combined status explosion.
- **Uniqueness is enforced in mutations**, since Convex has no unique constraints: one `usernameKey` across matchmakers; one candidate per `(matchmakerId, email)`; one candidate per `(matchmakerId, userId)`.
- **Account deletion and Convex Auth.** Convex Auth links a new sign-in to an existing user with the same email by default. Override `createOrUpdateUser` so a user with `deletedAt` is never reused.
- **Remove the template's demo `messages` table and `convex/messages.ts`** before this schema lands; they collide with the table above.
- Phase 2 adds tables (`facts`, `replySuggestions`) and fields (voice profile, conversation summaries, the `ai_suggestion` message source, the `agent` audit actor). Adding them later is a non-breaking schema change.

---

## 7. Backend layout

Domains under `packages/api/convex/`, each split into `rules.ts` / `mutations.ts` / `queries.ts` / `helpers.ts` per `CLAUDE.md`:

`users/`, `matchmakers/`, `candidates/` (including invitations), `conversations/` (conversations + messages), `notes/`, `audit/`, `notifications/`.

---

## 8. Email and notifications

Email is used for exactly three things, all sent from `matchmaker.io` through the Convex Resend component. **Email is not a conversation channel**: there is no reply-by-email and no inbound mail.

| Email | From | Content |
|---|---|---|
| Sign-in code | `no-reply@matchmaker.io` | One-time code |
| Invitation | `invites@matchmaker.io`, display name = the matchmaker's display name | "<Display name> invited you to Matchmaker" + invite link |
| New-message notification | `notifications@matchmaker.io` | "You have a new message from <name>" + link. **No message content:** conversations are sensitive, and inbox previews are visible to others. |

Only `matchmaker.io` needs DNS setup for sending (SPF, DKIM, DMARC).

### 8.1 Notification rules

Web push and email are both driven by **read markers**:

- **Seen** means the conversation is open and the tab is visible (`document.visibilityState === "visible"`). While that is true, the app calls `markRead(seq)` for the latest message shown, updating `matchmakerLastReadSeq` or `candidateLastReadSeq`.
- When a message is sent, the other participant becomes a notification target. Private messages and system notes never notify the candidate. Nobody is notified for a candidate whose membership isn't `joined`.
- **Web push** is scheduled **~30 s** later; **email** **~5 min** later. When the job fires it re-reads the conversation; if the recipient's read marker has reached the message it records `skipped_seen` and sends nothing.
- **Coalescing:** at most one scheduled job per (conversation, recipient, channel). Later messages ride on the pending job.
- **Throttling:** after an email is sent for a conversation, no further email for that conversation until the recipient has read it. Push: at most one per conversation per minute.
- Users can switch each channel off in `/settings`.
- Matchmakers are also notified when an invitation is accepted, and when a candidate leaves or deletes their account.

### 8.2 Web push

- The app ships a web app manifest and a service worker, so it can be installed to the home screen.
- Push uses VAPID keys (Convex env vars) and the `pushSubscriptions` table. Sending happens from a Convex action; subscriptions that return 404/410 are removed (auth plumbing, not audited data).
- **iOS only supports web push for home-screen-installed web apps** (iOS 16.4+). Prompt iOS users to "Add to Home Screen" before asking for push permission; email is their fallback until then.
- Ask for push permission after a meaningful moment (e.g. after sending the first message), not on first load.

### 8.3 Sign-in

Convex Auth with the Resend email provider, **one-time code** rather than a magic link. A magic link opened from a mail app often lands in a different browser than an installed home-screen app, which breaks sign-in there; a typed code does not. Sign-up collects name and email; the verified email is what matches pending invitations.

---

## 9. Multi-tenancy & privacy

### 9.1 Isolation

- The same real person may be a candidate of two matchmakers. Their two candidate records, and all conversations, notes and audit events attached, are **completely isolated**. Neither matchmaker can learn anything about the other's knowledge of that person, or that the other exists.
- The onboarding form behaves identically whether or not an email belongs to an account (§3.1).
- Account-level changes (name change, account deletion) are fanned out as separate audit events per matchmaker (§5.1).

### 9.2 Access helpers

Every function derives access from one of these helpers, never from arguments alone:

- `requireUser(ctx)` — the signed-in, non-deleted user, or throw.
- `requireMatchmaker(ctx, matchmakerId)` — the user must own that matchmaker profile. Workspace functions take `matchmakerId` from the URL-selected workspace and pass it through this check.
- `requireCandidateSelf(ctx, candidateId)` — the user must be that candidate's linked account and `membership` must be `joined`. Candidate-facing functions return only `visibility: "everyone"` messages (via the `by_conversation_visibility` index).
- Any document loaded by id (candidate, conversation, note) must have its `matchmakerId` checked against the matchmaker the caller was authorised for.
- Scheduled jobs are `internal` and receive `matchmakerId` from an already-authorised caller.

### 9.3 Sensitive data

Candidate conversations include sexual orientation, religion, health and family plans — special-category data under GDPR.

- **Roles:** the matchmaker is the data controller for their candidates; the platform is a processor. This needs a data-processing agreement in the terms.
- **Consent:** the accept screen carries a privacy notice: the matchmaker keeps the conversation on the platform, including after the candidate leaves or deletes their account.
- **Retention:** nothing is deleted (§6). Formal erasure requests are handled by an admin process outside the UI — see open decisions.

---

## 10. Platform & hosting

- **Domain (interim): `aileenlancif.com`.** Until a neutral product domain is bought, the production deployment is served at `https://www.aileenlancif.com` with path-based hosting (option 3 below): the marketing site at `/`, the app at `/app/`, HTTP actions at `/api/`. The apex redirects to `www`. This is a stopgap — a matchmaker's personal name is the wrong long-term domain for a multi-matchmaker product. `aileenlancif.com` can later become Aileen's own custom domain (see backlog).
- **Frontends (target):** `app.<product-domain>` (Vite app) and `www.<product-domain>` (Next.js static export). `matchmaker.io`, `.app` and `.co` are all taken; candidates checked 2026-09-19 include `usematchmaker.com` and `introdesk.app`. The marketing site's CTAs link to the app.
- **Auth:** Convex Auth (`@convex-dev/auth`) with an email one-time-code provider. Replaces turbostack's Clerk wiring. Convex validates session tokens through the OpenID discovery document at `<site>/.well-known/openid-configuration`, which has to sit at the site root. So `convex/http.ts` owns the whole URL space: `/.well-known/…` for auth, `/api/…` for HTTP actions, then the static sites as catch-alls (`/app/…`, then `/`).
- Nothing in `apps/www` may need a Node server at request time. All server logic lives in Convex.
- **Hosting on two subdomains is an open decision.** Static sites are routed by path only (today: `www` at `/`, `app` at `/app/`), so pointing `app.` and `www.` at one deployment would serve the same paths on both. Options:
  1. Host-aware routing in `convex/http.ts` dispatching on the `Host` header. `http.ts` already registers the static sites itself (`registerStaticRoutes`), so this is a wrapper around those handlers.
  2. Host `www` separately (it only calls the waitlist mutation) and mount `app` at `/` on the main deployment.
  3. Keep path-based hosting on one domain.

  This doesn't block local development. Whichever is chosen, the app's Vite `base` becomes `/`.

---

## 11. Build order

1. *Done.* **Auth & foundations:** Convex Auth with email OTP; `users` override with `deletedAt` and `createOrUpdateUser`; access helpers; `recordAudit` and the action list; schema; home page skeleton. Remove the demo `messages` table and Clerk.
2. *Done.* **Matchmaker profiles:** create (username rules, reserved list), workspace route, settings.
3. *Done.* **Onboarding:** Onboard form → candidate + conversation + private imported message + invitation.
4. *Done.* **Invitations:** invite email, `/invite/:token`, home-page invitations, accept/decline, resend/revoke/change email, expiry job.
5. *Done.* **Chat:** real-time messaging on both sides, read markers, private-message badge, candidate view.
6. **Candidate panel:** Details, Notes, History.
7. **Leaving & account deletion.**
8. **Notifications:** delayed email, web push, PWA manifest and service worker, settings.

**Done when:** a friendly matchmaker can onboard real candidates and run conversations in the app for a week without falling back to DMs.

---

## 12. Open decisions (phase 1)

- **Hosting on two subdomains** (§10). Deferred: the interim domain uses path-based hosting on one origin. Revisit when the product domain is bought.
- **Erasure requests.** "Nothing is deleted" conflicts with a GDPR right-to-erasure request. Proposed: an admin-only process that anonymises the person's data on request. Needs legal review before real candidates are onboarded.
- **Notification delays.** 30 s push / 5 min email are starting points; tune with the first matchmaker.
