# Matchmaker OS — Product Requirements Document

**Working name:** matchmaker.io
**Status:** Draft v1 — for implementation
**Stack:** Next.js (App Router) + TypeScript + React, Convex (DB, functions, scheduling, agents), Resend (transactional + inbound email, via the Convex Resend component), Vercel hosting.

---

## 1. Problem & positioning

Broad dating apps (Tinder, Bumble, Hinge) have optimised for quantity of matches and degraded on quality. A parallel market has re-emerged: independent human matchmakers, often discovered via Instagram or word of mouth, who curate a small book of clients and introduce one or two genuinely considered matches at a premium price.

These matchmakers today run on a stack of: a marketing website with a contact form, Instagram/WhatsApp DMs, a spreadsheet or notes app, and their own memory.

**We are not building a dating app.** We are building the operating system for the matchmaker — tooling that makes one matchmaker sharper, faster, and able to carry a bigger book without losing the curation quality that is the product they sell.

**Non-goal:** replacing matchmaker judgement with an algorithm. The AI enriches, organises, drafts, and surfaces. The human decides.

---

## 2. Users

| User | Role | Access |
|---|---|---|
| **Matchmaker** | Tenant owner. Runs their book of clients. Primary user; all AI features serve them. | Full app: conversations, profiles, match board, settings. |
| **Client** | A person seeking a match, belonging to exactly one matchmaker's book. | Minimal chat-only interface. No AI features. No visibility into other clients or into their own fact profile. |

---

## 3. Core concepts

- **Matchmaker** — the tenant. All data is scoped to a matchmaker.
- **Client** — a matchmaker's record of a person. A real human who signs up with two matchmakers produces two independent, fully isolated client records. There is **no shared person entity in v1.**
- **Conversation** — exactly one per client. A unified thread carrying messages from multiple channels.
- **Message** — a single message in a conversation, tagged with its channel (`email` | `chat`) and direction.
- **Fact** — a discrete, atomic piece of knowledge about a client, with provenance and confidence. Facts are the client's profile. They are private to the owning matchmaker.
- **Match** — a first-class entity linking two clients of the same matchmaker, with a lifecycle and an outcome.
- **Voice profile** — a distilled representation of how a given matchmaker writes, used to condition AI-drafted replies.

---

## 4. Scope

### 4.1 V1 (this build)

The thesis to prove: *a matchmaker would rather run a client relationship through this app than through raw Instagram DMs.*

In scope:

1. Matchmaker auth + onboarding (including sending-domain setup).
2. New-client creation from a pasted DM transcript + email address.
3. AI-drafted first outbound email, approved by the matchmaker, sent from their own domain.
4. Unified conversation window: outbound and inbound email, plus in-app chat for clients who sign in.
5. Client-facing chat interface (sign-in via emailed magic link).
6. AI suggested replies inside the conversation.
7. AI profile enrichment: conversational agent extracts candidate facts → reconciliation agent writes them. Confidence-gated auto-apply vs. suggest.
8. Client profile panel with fact list, manual edit, and provenance.
9. Multi-tenant isolation enforced at the Convex query layer.

### 4.2 V2 (next slice, designed for but not built)

- Match board (Kanban) with AI-generated match candidates.
- Two-stage matching pipeline (hard filter → AI compatibility reasoning).
- Match lifecycle, introduction flow, outcome capture.
- Manual match creation.
- Dedicated voice-distillation agent.
- Reminders / follow-up agent.
- Cross-conversation retrieval surfaced inline in chat.

### 4.3 Explicitly deferred

Billing and pricing, team/multi-seat matchmaker accounts, native WhatsApp/Instagram integration, cross-matchmaker anything, mobile native apps, analytics dashboards.

---

## 5. Key flows

### 5.1 Client intake (the DM handoff)

1. Client DMs the matchmaker on Instagram/WhatsApp. Some rapport is built off-platform. **We do not try to own this step.**
2. Matchmaker asks for an email address in the DM.
3. In the app: **New Client** → paste the email address, name (optional), and the DM transcript into a single textarea.
4. On submit, the intake agent parses the transcript: extracts a name if present, extracts candidate facts, and drafts a warm first email continuing the conversation in the matchmaker's voice.
5. Matchmaker reviews the draft email in an editable composer, edits if needed, and approves.
6. Email sends from the matchmaker's verified domain. The pasted transcript is stored as seed messages in the conversation, marked `channel: "imported"`, so the thread reads continuously.
7. The email contains a magic link to the client chat interface.

**Design constraint:** the first email must not read as templated. It is conditioned on the actual DM transcript and the matchmaker's voice profile, and it is always human-approved before sending.

**Failure path:** if no domain is verified yet, block send and route the matchmaker to domain setup. Do not fall back to sending from a platform domain — deliverability and brand both suffer.

### 5.2 Ongoing conversation

- Matchmaker opens a client thread. Recent messages render in the centre column.
- On each inbound client message, the conversational agent produces 1–3 suggested replies, rendered inline as a visually distinct card (never styled like a real message), each with **Send**, **Edit**, **Dismiss**.
- The same agent emits candidate facts as a side-channel output. These go to the reconciliation agent asynchronously.
- High-confidence facts auto-apply and surface as a small inline system note ("Added to profile: prefers partners 6'0\"+ · Undo").
- Low-confidence facts surface as an inline suggestion card with **Add** / **Dismiss**.
- Outbound delivery: if the client has an active in-app session, deliver as chat; otherwise send as email. The matchmaker does not choose a channel.

### 5.3 Client experience

- Magic-link sign-in from the first email.
- Single chat window. No profile view, no facts, no other clients, no AI.
- Replying to the email instead of using the app works identically and lands in the same thread.

---

## 6. Data model

Tenant key is `matchmakerId` on every row. **Every Convex query and mutation must filter by the authenticated matchmaker's id.** No exceptions, no shared lookups.

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  matchmakers: defineTable({
    userId: v.string(),              // auth subject
    displayName: v.string(),
    businessName: v.optional(v.string()),
    sendingDomain: v.optional(v.string()),
    sendingAddress: v.optional(v.string()),   // e.g. hello@theirdomain.com
    resendDomainId: v.optional(v.string()),
    domainStatus: v.union(
      v.literal("unconfigured"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("failed"),
    ),
    voiceProfile: v.optional(v.string()),     // distilled prose description of tone/style
    voiceSamples: v.optional(v.array(v.string())), // onboarding-pasted samples
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  clients: defineTable({
    matchmakerId: v.id("matchmakers"),
    name: v.optional(v.string()),
    email: v.string(),
    status: v.union(
      v.literal("intake"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
    hasAppAccess: v.boolean(),
    lastActiveAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_matchmaker", ["matchmakerId"])
    .index("by_matchmaker_email", ["matchmakerId", "email"]),

  conversations: defineTable({
    matchmakerId: v.id("matchmakers"),
    clientId: v.id("clients"),
    replyToToken: v.string(),        // unique inbound routing token
    summary: v.optional(v.string()), // rolling summary of messages outside the live window
    summarisedThroughSeq: v.optional(v.number()),
    lastMessageAt: v.number(),
    unreadForMatchmaker: v.boolean(),
  })
    .index("by_matchmaker", ["matchmakerId"])
    .index("by_client", ["clientId"])
    .index("by_replyToToken", ["replyToToken"]),

  messages: defineTable({
    matchmakerId: v.id("matchmakers"),
    conversationId: v.id("conversations"),
    seq: v.number(),                 // monotonic within conversation
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    channel: v.union(
      v.literal("email"),
      v.literal("chat"),
      v.literal("imported"),         // pasted DM transcript
    ),
    body: v.string(),                // plain text, cleaned
    bodyHtml: v.optional(v.string()),
    externalId: v.optional(v.string()), // Resend message id
    sentAt: v.number(),
    aiAssisted: v.optional(v.boolean()), // outbound came from a suggestion
  })
    .index("by_conversation", ["conversationId", "seq"]),

  facts: defineTable({
    matchmakerId: v.id("matchmakers"),
    clientId: v.id("clients"),
    category: v.union(
      v.literal("hard_constraint"),  // age range, location, wants kids, gender preference
      v.literal("preference"),       // soft desires in a partner
      v.literal("attribute"),        // about the client themselves
      v.literal("lifestyle"),
      v.literal("background"),
      v.literal("logistics"),        // availability, timeline, budget
      v.literal("note"),
    ),
    key: v.optional(v.string()),     // normalised key for structured facts, e.g. "wants_kids"
    value: v.string(),               // structured value or free text
    text: v.string(),                // human-readable rendering
    confidence: v.number(),          // 0..1 from the extracting agent
    status: v.union(
      v.literal("active"),
      v.literal("suggested"),        // awaiting matchmaker approval
      v.literal("superseded"),
      v.literal("rejected"),
    ),
    supersededBy: v.optional(v.id("facts")),
    sourceMessageId: v.optional(v.id("messages")),
    sourceQuote: v.optional(v.string()),
    origin: v.union(v.literal("ai"), v.literal("manual")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId", "status"])
    .index("by_client_key", ["clientId", "key"]),

  // ---- V2, define now, populate later ----
  matches: defineTable({
    matchmakerId: v.id("matchmakers"),
    clientAId: v.id("clients"),
    clientBId: v.id("clients"),
    origin: v.union(v.literal("ai"), v.literal("manual")),
    score: v.optional(v.number()),
    reasoning: v.optional(v.string()),
    stage: v.union(
      v.literal("suggested"),
      v.literal("reviewing"),
      v.literal("introduced"),
      v.literal("mutual_interest"),
      v.literal("connected"),
      v.literal("rejected"),
    ),
    clientAResponse: v.optional(v.union(v.literal("pending"), v.literal("yes"), v.literal("no"))),
    clientBResponse: v.optional(v.union(v.literal("pending"), v.literal("yes"), v.literal("no"))),
    rejectedBy: v.optional(v.union(v.literal("matchmaker"), v.literal("clientA"), v.literal("clientB"))),
    rejectionReason: v.optional(v.string()),
    outcome: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_matchmaker_stage", ["matchmakerId", "stage"])
    .index("by_clientA", ["clientAId"])
    .index("by_clientB", ["clientBId"]),
});
```

**Modelling notes for the implementer:**

- Facts are discrete records, not a profile blob. This is deliberate: reconciliation, provenance, supersession, and later retrieval all depend on it. Do not "simplify" this into a JSON document.
- Never hard-delete a fact that a client statement contradicts. Mark it `superseded` and link forward. The history of change is matchmaking signal ("was certain about kids in March, wavering in September").
- `hard_constraint` facts should carry a normalised `key` and machine-comparable `value` — these drive the cheap pre-filter in V2 matching. Everything else can stay free-text.

---

## 7. AI architecture

### 7.1 Agents

Three agents in v1 (one foreground, two background). They communicate **through the database**, never by sharing context.

**A. Conversation agent** (foreground, latency-sensitive)
- Input: system prompt + matchmaker voice profile + active facts for this client + conversation summary + last N messages.
- Output: (1) 1–3 suggested replies; (2) an array of candidate facts extracted from the latest inbound message, each with confidence and a source quote.
- Must **not** receive the full fact base of other clients. Tight, focused context.

**B. Fact reconciliation agent** (background, per candidate fact)
- Input: the candidate fact + its source message text + all `active` facts for that client.
- Output: one of `ADD`, `DISCARD_DUPLICATE`, `UPDATE_EXISTING(id)`, `SUPERSEDE(id)`.
- Writes to `facts`. Auto-applies when confidence ≥ threshold (start at 0.8); otherwise writes with `status: "suggested"`.
- Give it the source message, not just the extracted fact — context disambiguates a joke from a statement.

**C. Voice profile agent** (background, batched, low frequency)
- Input: a batch of the matchmaker's own sent outbound messages (≥ 20, or onboarding samples).
- Output: a prose voice profile — register, warmth, sentence length, greeting/sign-off habits, characteristic phrases, things they never say.
- Runs on a schedule or after every N outbound messages, not per message. Tone emerges from volume.
- In v1 this may be a simple scheduled job seeded by onboarding-pasted samples. The full agent is a V2 refinement.

**Extensibility:** this "foreground agent emits signal → background workers process it" shape is the same pattern V2's match-candidate generation and reminder agents will use. Build the handoff (Convex scheduler / action) as a reusable mechanism.

### 7.2 Context assembly

**Facts are never appended into the message history.** They are state, read live from the database at prompt-assembly time.

Each conversation-agent call assembles:

```
[system prompt: role, guardrails, output format]
[matchmaker voice profile]
[client facts: active facts, grouped by category, rendered as a compact list]
[conversation summary: if the thread exceeds the live window]
[last N messages verbatim]
```

This means a newly written fact is reflected in the very next generation with no duplication and no history pollution.

### 7.3 Long-thread handling

- Live window: last **20** messages verbatim (tune later).
- Older messages roll into `conversations.summary` via a background summarisation job triggered when the thread crosses a length threshold.
- The summary is for **conversational continuity**, not fact retention — facts already live in the fact store. Keep it short: rapport, tone of the relationship, key events (matches proposed, dates that happened, sensitivities).
- Track `summarisedThroughSeq` so summarisation is incremental.

### 7.4 Evaluation

Semantic deduplication is the hard sub-problem: "likes hiking" and "enjoys the outdoors" should merge; "likes hiking" and "hates the gym" should not. Build a small eval set early — 40–60 real (existing facts, candidate fact) pairs with known correct actions — and run it against the reconciliation prompt on every prompt change. Without this, prompt tuning is guesswork.

---

## 8. UI

Three-column, mobile-first. On narrow viewports, **only the centre column is visible by default**; left and right collapse behind menu affordances.

**Left — conversation list.** Clients sorted by recency, with unread indicators. Search. "New Client" button.

**Centre — conversation.** The heart of the app and the always-visible column. Contains:
- The unified message timeline (email and chat messages visually differentiated by a subtle channel marker only — the thread reads as one conversation).
- Inline AI suggestion cards: suggested replies, and fact suggestions. **Must be visually distinct from real messages** — different background, clear AI affordance, accept/dismiss controls. A matchmaker must never mistake an AI suggestion for something the client said.
- Inline system notes for auto-applied facts, with Undo.
- Composer.

**Right — client context panel (collapsible).** Tabbed, profile as default:
- **Profile** — active facts grouped by category, each showing its source quote on hover/expand. Manual add/edit/remove. Suggested facts appear here too, as a pending section.
- **Reminders** (V2), **Payments** (V2), **Notes**.

**Separate view — Match board** (V2). Kanban, not a panel: reviewing matches is a different mode of work than chatting.

Columns: `Suggested` → `Reviewing` → `Introduced` → `Mutual interest` → `Connected`.
`Rejected` is a **lane**, not a terminal column — a card can drop into it from any stage. Capture who rejected and why on the way in; that is taste signal. Rejected cards age out of the board after a period.
Manual match creation lives on this same board and produces an identical `matches` record with `origin: "manual"`.

The `Introduced → Mutual interest` transition depends on two separate yeses (`clientAResponse`, `clientBResponse`). Handle as sub-state on the card rather than adding columns.

---

## 9. Email infrastructure

### 9.1 Outbound — white-labelled sending

Matchmakers must send from their own domain; platform-domain sending is not acceptable for a premium service.

Onboarding flow:
1. Matchmaker enters their domain.
2. Backend calls Resend's domain-create API → returns DNS records (SPF, DKIM, and recommended DMARC).
3. UI displays the records with copy buttons and registrar-specific hints.
4. "Verify" button polls Resend's verification status; `domainStatus` updates accordingly.
5. Sending is blocked until `verified`.

Use the **Convex Resend component** (already familiar to this team). Each matchmaker's domain is verified independently.

Expect the DNS step to be the single hardest moment for non-technical matchmakers. Budget for a clear guide and a white-glove "we'll set this up for you" fallback.

### 9.2 Inbound — email replies into the thread

The fiddly part. Requirements:

- **Routing:** issue a unique per-conversation reply-to address using `conversations.replyToToken`, e.g. `c+<token>@inbound.matchmaker.io`, set as `Reply-To` on every outbound email. Inbound webhook resolves the token → conversation. Never attempt to match on sender email alone (same person, two matchmakers; forwarded mail; aliases).
- **Cleaning:** strip quoted reply history, signatures, and "On [date] X wrote:" blocks before storing. Store the cleaned plain text in `body`; retain raw HTML in `bodyHtml` for fallback display.
- **Idempotency:** dedupe on Resend's message id; webhooks can redeliver.
- **Attachments:** out of scope for v1 — acknowledge in the thread but do not process.

---

## 10. Multi-tenancy & privacy

This is a hard requirement, not a nice-to-have.

- The same real person may be a client of two different matchmakers. Their two client records, and all facts, conversations, and matches attached, are **completely isolated**. Neither matchmaker can learn anything about the other's knowledge of that person, or that the other exists.
- There is **no shared person entity** in v1. A `clients` row belongs to exactly one matchmaker, full stop.
- Enforce tenancy in a single shared helper at the Convex function layer (`requireMatchmaker(ctx)` returning the authenticated matchmaker id), and have every query/mutation derive its scope from it. Do not pass `matchmakerId` from the client.
- Clients authenticate separately and can access only their own conversation. Clients cannot see their own fact profile, other clients, or match records.
- Facts derived in one conversation may be used to surface matches **within the same matchmaker's book only**.

---

## 11. Non-functional requirements

- **Suggested-reply latency:** first token under ~2s. Stream the suggestion. If generation fails, fail silently — the composer must always work without AI.
- **AI is never blocking.** Every AI feature degrades to a plain, fully functional CRM + inbox.
- **Cost control:** the conversation agent runs on every inbound message; keep its context tight. Background agents can use a cheaper/slower model.
- **Audit:** every auto-applied fact is undoable and shows provenance.
- **Mobile:** matchmakers work from their phone. The centre column must be fully usable at 380px.

---

## 12. Build order

1. Auth, matchmaker record, tenancy helper, schema.
2. Client creation (manual, no AI) + conversation + message storage.
3. Outbound email via Resend + domain verification onboarding.
4. Inbound email webhook, token routing, reply cleaning.
5. Client magic-link auth + client chat interface. **At this point the product is a working unified inbox with zero AI — verify it stands on its own.**
6. Conversation agent: suggested replies, with voice profile from onboarding samples.
7. Fact extraction + reconciliation agent + profile panel.
8. Intake agent: transcript parsing + first-email drafting.
9. Thread summarisation job.
10. Eval harness for reconciliation.

Ship 1–7 to a single friendly matchmaker before building V2.

---

## 13. Open questions

- **Voice cold start.** On day one there is no sent-message history. Onboarding asks for pasted samples — how many, and is that enough for the first email to not feel generic?
- **The introduction moment.** V2, but unresolved: what exactly gets shared with each party, how much of the other's profile, and does the introduction happen through the platform or hand back to the matchmaker's own channels? This is the product's payoff moment and needs design before V2 starts.
- **Fact visibility to clients.** Currently none. Is there a version where a client reviewing and correcting their own profile improves data quality enough to be worth the complexity?
- **Auto-apply threshold.** 0.8 is a guess. Needs tuning against real conversations; too low and it feels presumptuous, too high and it nags.
- **Suggested-reply count.** 1 vs 3. Three options may be more choice paralysis than help on mobile.