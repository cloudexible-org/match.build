# Phase 2 — AI assistance

**Status:** Draft. The design below is proposed, not agreed. §9 sorts what's left into what must be settled before any code, what ships as a setting and gets tuned with the pilot, and what is still an open product question.
**Depends on:** [phase-1.md](phase-1.md) shipped *and used by a real matchmaker* — which is gated on the terms in [#1](https://github.com/cloudexible-org/match.build/issues/1), not on engineering. One item in §9 has to be decided **before** those terms are drafted; see §9.1.
**Data protection:** everything this phase adds is swept in [#3](https://github.com/cloudexible-org/match.build/issues/3) before v1 ships. Facts are the matchmaker's own records, like their notes (§7).
**Goal:** make the matchmaker faster and sharper inside the conversation they already run in the app: suggested replies in their voice, and a candidate profile that builds itself from the conversation.

**Principle:** AI is never blocking. If any of this fails, phase 1 still works exactly as before.

---

## 1. Scope

1. **Reply suggestions** in the conversation, in the matchmaker's voice.
2. **Facts:** extraction from the imported history and every candidate message; reconciliation into a structured profile; confidence-gated auto-apply vs. suggest; undo.
3. **Profile tab** in the candidate panel: facts grouped by category, with provenance and manual add/edit/remove.
4. **Voice profile** from samples pasted in matchmaker settings, refined from sent messages.
5. **Thread summaries** for long conversations.
6. **Eval harness** for reconciliation.

All fact changes and voice-profile changes are written to the phase-1 audit trail.

---

## 2. Conversation experience (proposed)

- On each candidate message (debounced, §4A), the reply suggester produces 1–3 suggested replies, rendered inline as a visually distinct card (never styled like a real message), each with **Send**, **Edit**, **Dismiss**. A matchmaker must never mistake an AI suggestion for something the candidate said.
- When a candidate accepts an invitation, a suggested welcome message appears.
- Fact extraction runs in the background. High-confidence facts auto-apply and surface as a private system note ("Added to profile: prefers partners 6'0\"+ · Undo"). Low-confidence facts surface as an inline suggestion card with **Add** / **Dismiss**.
- The composer always works without AI.

---

## 3. Data model additions (proposed)

Written in the conventions `packages/api/convex/schema.ts` actually uses, which are not the ones the first draft of this file guessed at: rows have no `createdAt` (Convex's built-in `_creationTime` carries it), and indexes name every field in full, joined with `_and_` — `by_conversationId_and_seq`, not `by_conversation_seq`.

```ts
// Added to convex/schema.ts in phase 2

matchmakers: {
  // …phase-1 fields
  voiceProfile: v.optional(v.string()),          // distilled prose description of tone/style
  voiceSamples: v.optional(v.array(v.string())), // pasted in matchmaker settings
}

// The table is `conversations`; the domain that owns its functions is
// `convex/messages/` (prd/phase-1.md §7). The summariser lands there.
conversations: {
  // …phase-1 fields
  summary: v.optional(v.string()),               // rolling summary of messages outside the live window
  summarisedThroughSeq: v.optional(v.number()),
}

messages.source: add v.literal("ai_suggestion")  // matchmaker sent an AI suggestion (edited or not)

// A third variant of the `auditActor` union in schema.ts, alongside `user`
// (whose roles are already account | matchmaker | candidate | platform_admin)
// and `system`. The renderer in audit/rules.ts needs a case for it, and
// apps/admin's trail shows it too.
auditEvents.actor: add
  v.object({
    type: v.literal("agent"),
    agent: v.union(v.literal("fact_reconciler"), v.literal("voice_profile")),
    model: v.string(),
  })
auditEvents: add sourceMessageId: v.optional(v.id("messages")), undoOf: v.optional(v.id("auditEvents"))

// AI reply suggestions. Persisted so they survive reloads and can be marked stale.
replySuggestions: defineTable({
  matchmakerId: v.id("matchmakers"),
  conversationId: v.id("conversations"),
  triggerSeq: v.number(),               // the candidate message that triggered generation
  status: v.union(
    v.literal("generating"),
    v.literal("ready"),
    v.literal("used"),
    v.literal("dismissed"),
    v.literal("stale"),                 // a newer message arrived, or the matchmaker replied manually
    v.literal("failed"),
  ),
  replies: v.array(v.string()),
}).index("by_conversationId_and_status", ["conversationId", "status"]),

facts: defineTable({
  matchmakerId: v.id("matchmakers"),
  candidateId: v.id("candidates"),
  category: v.union(
    v.literal("hard_constraint"),  // age range, location, wants kids, gender preference
    v.literal("preference"),       // soft desires in a partner
    v.literal("attribute"),        // about the candidate themselves
    v.literal("lifestyle"),
    v.literal("background"),
    v.literal("logistics"),        // availability, timeline, budget
    v.literal("note"),
  ),
  key: v.optional(v.string()),     // from the key registry (§3.1); required for hard_constraint
  value: v.string(),               // structured value (per the registry) or free text
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
})
  .index("by_candidateId_and_status", ["candidateId", "status"])
  .index("by_candidateId_and_key", ["candidateId", "key"]),
```

**Modelling notes:**

- Facts are discrete records, not a profile blob. Reconciliation, provenance, supersession, and later retrieval all depend on it. Do not "simplify" this into a JSON document.
- A fact a candidate contradicts is never deleted: it is marked `superseded` and linked forward. The history of change is matchmaking signal ("was certain about kids in March, wavering in September").
- There is no in-place update. Every change produces a new fact plus an audit event, so every change can be undone from the audit trail. That is also why `facts` carries no `updatedAt`: a row that is never edited has nothing to stamp.
- **Facts are the matchmaker's record, not the candidate's profile.** They are collected and maintained by the matchmaker with the AI's help, exactly like their notes, and the matchmaker is the controller (prd/phase-1.md §9.3). An erasure therefore anonymises them and leaves them standing, like everything else in that matchmaker's book — but `admin.mutations.eraseAccount` walks an **explicit** list of tables with a ceiling per table (`ERASURE_LIMITS`), so a new table is invisible to it until it is added. Adding `facts` to the erasure in the same change that adds the table is not optional; [#3](https://github.com/cloudexible-org/match.build/issues/3) holds the decision and the rest of the sweep.
- **`sourceQuote` is a verbatim copy of message text**, which prd/phase-1.md §12 deliberately leaves outside an erasure's reach. Whatever [#2](https://github.com/cloudexible-org/match.build/issues/2) concludes has to hold for both places at once, or the product's answer is incoherent.
- Fact audit actions: `fact.created`, `fact.edited`, `fact.accepted` (suggested → active), `fact.rejected`, `fact.superseded`, `fact.undone`. Voice: `matchmaker.voice_samples_changed`, `matchmaker.voice_profile_regenerated`.

### 3.1 Fact key registry

`hard_constraint` facts carry a `key` from a fixed registry in `convex/facts/rules.ts` and a machine-comparable `value`; these drive the cheap pre-filter in phase-3 matching. Without a registry the model will emit `wants_kids` in one place and `wants_children` in another. Proposed starting set:

| Key | Value format |
|---|---|
| `age` | integer |
| `partner_age_range` | `"<min>-<max>"` |
| `gender` | free text, normalised |
| `seeking_gender` | comma-separated list |
| `location_city` | free text, normalised |
| `willing_to_relocate` | `yes` / `no` / `maybe` |
| `has_kids` | `yes` / `no` |
| `wants_kids` | `yes` / `no` / `maybe` |
| `religion` | free text |
| `religion_importance` | `low` / `medium` / `high` |

A `hard_constraint` with an unknown key is downgraded to `note`.

---

## 4. Agents and jobs (proposed)

They communicate **through the database**, never by sharing context. Phase 3's match and reminder agents reuse the same mechanism.

**Components, not hand-rolled plumbing.** Three of the four things this phase needs around an LLM call already exist as Convex components, and phase 1 hand-rolled nothing it didn't have to:

| Component | What it does here |
|---|---|
| `@convex-dev/workpool` | Every background job below. Gives §4C its "one job per candidate at a time" as configuration rather than as a lock invented in a `facts` row. |
| `@convex-dev/persistent-text-streaming` | §4A's streamed replies. A mutation per token is a database write per token, which is what "streamed into a `replySuggestions` row" would otherwise mean. |
| `@convex-dev/rate-limiter` | §6's per-matchmaker AI budget. |

**Deliberately not `@convex-dev/agent`.** It is the obvious reach for "add an AI agent to a Convex app", and it is the wrong one here: it brings its own threads and messages tables, and this product already has `conversations` and `messages` that are tenanted, audited, read-markered, notification-driving and erasure-aware. Phase 1 spent five of its eight steps earning those properties. `@convex-dev/rag` is worth a look in phase 3 for cross-conversation retrieval, not here.

**A. Reply suggester** (foreground, latency-sensitive)
- Trigger: a candidate message, **debounced** (~5 s after the last one, so a burst of messages produces one generation). Also once when a candidate accepts, for a welcome message.
- Input: system prompt + voice profile + active facts for this candidate + conversation summary + last N messages (including private imported history).
- Output: 1–3 replies, streamed through `persistent-text-streaming`; the `replySuggestions` row holds the status and the finished text, so a reload still finds them.
- Earlier `ready` suggestions become `stale` when a new message arrives or the matchmaker replies manually.
- Never receives other candidates' data.

**B. Fact extractor** (background, cheaper model)
- Separate from the reply suggester, so structured extraction never slows the streamed replies.
- Trigger: each candidate message, and the imported history at onboarding.
- Output: candidate facts, each with category, key (if any), value, text, confidence and a verbatim source quote.

**C. Fact reconciler** (background)
- Runs once per message over all its candidate facts together, serialised per candidate — a `workpool` with a per-candidate key, one job at a time. Parallel per-fact jobs would race: two facts from one message could both add a duplicate or both supersede the same fact.
- Input: the candidate facts + source message text + the candidate's `active` and `suggested` facts, plus recently `rejected` ones (so dismissed suggestions don't keep coming back).
- Output per fact: `ADD`, `DISCARD_DUPLICATE`, or `SUPERSEDE(id)`.
- Auto-applies when confidence ≥ threshold (start at 0.8); otherwise writes `status: "suggested"`.
- **Never auto-supersedes a `manual` fact: that change is always a suggestion, and a suggestion is allowed.** A matchmaker who typed something themselves has to be the one to change it, but a conversation that contradicts what they typed is exactly the thing worth telling them about. (The first draft of this file listed this as an open question in §9 while answering it here; the answer stands.)
- Writes through internal mutations that call `recordAudit` with the agent as actor. **Undo** reverses the audit event (restores the superseded fact, marks the new one `rejected`).

**D. Voice profile job** (background, batched)
- Input: the matchmaker's pasted samples, then their own sent messages (≥ 20).
- Output: a prose voice profile — register, warmth, sentence length, greeting/sign-off habits, characteristic phrases, things they never say.
- Runs on a schedule or after every N sent messages, not per message.

**E. Summariser** (background)
- Live window: last **20** messages verbatim. Older messages roll into `conversations.summary` when the thread crosses a threshold, tracked by `summarisedThroughSeq` so it's incremental.
- For conversational continuity, not fact retention: rapport, tone, key events, sensitivities.

### 4.1 Context assembly

Facts are never appended into message history. They're read live at prompt time:

```
[system prompt: role, guardrails, output format]
[matchmaker voice profile]
[candidate facts: active facts, grouped by category, rendered as a compact list]
[conversation summary: if the thread exceeds the live window]
[last N messages verbatim]
```

A newly written fact is reflected in the very next generation.

**Guardrails:** candidate messages are untrusted input — instructions inside them are content, not commands. Suggested replies must not reveal facts the candidate hasn't stated in this conversation, or the matchmaker's notes.

### 4.2 Evaluation

Semantic deduplication is the hard sub-problem: "likes hiking" and "enjoys the outdoors" should merge; "likes hiking" and "hates the gym" should not. Build 40–60 (existing facts, candidate fact) pairs with known correct actions and run them against the reconciliation prompt on every prompt change. Build the set from **synthetic or consented** conversations, never raw candidate data.

---

## 5. UI additions

- **Conversation:** reply-suggestion cards, fact-suggestion cards, system notes with Undo (all private to the matchmaker).
- **Candidate panel:** a **Profile** tab, second after Details: active facts grouped by category, source quote on hover/expand, manual add/edit/remove, a pending section for suggested facts. *The first draft made it the default, which contradicts prd/phase-1.md §4.1 and what shipped.* **Details stays the default:** it holds membership state and the invite controls — what a matchmaker needs on opening a thread they haven't touched in a week — while Profile is a reading surface. Moving the default is a pilot-tuned call, not one to make in a draft.
- **History tab:** gains fact and agent entries, with a link to the source message and Undo where possible. New filter: Profile.
- **Matchmaker settings:** voice samples.

The welcome suggestion on acceptance (§2, §4A) is triggered from `convex/invites/`, which owns accepting an invitation (prd/phase-1.md §7).

## 6. Non-functional requirements

- **Suggested-reply latency:** first token under ~2 s, through `persistent-text-streaming` (§4). On failure, fail silently.
- **Cost control:** keep the reply suggester's context tight; background jobs use a cheaper model; `rate-limiter` caps AI calls per matchmaker.
- **Audit:** every auto-applied fact is undoable and shows provenance.
- **Every number in this phase is a deployment setting**, declared in `convex.config.ts` beside phase 1's: the auto-apply threshold, the suggested-reply count, the debounce window, the voice-sample minimum, the live-window size and the per-matchmaker budget. Phase 1 did this for its two notification delays once prd/phase-1.md §12 admitted they were guesses that only a real matchmaker could correct (`NOTIFICATION_PUSH_DELAY_SECONDS`, `NOTIFICATION_EMAIL_DELAY_SECONDS`). Every number in §9.2 is the same kind of guess, and tuning one should not need a deploy.

## 7. Privacy

- **Use an LLM provider and API tier with no training on inputs and a documented retention period.** That provider is a **sub-processor**, so the DPA in [#1](https://github.com/cloudexible-org/match.build/issues/1) has to name it — which is why choosing it is §9.1's first item and has to happen before those terms are drafted rather than when this phase starts.
- **Facts are the matchmaker's records**, collected and maintained by them with the AI's help, like their notes. The matchmaker is the controller (prd/phase-1.md §9.3); an erasure anonymises facts and leaves them standing (§3).
- **Candidates never see their facts.** That is a UI decision and not a legal one: facts are personal data about the candidate, so an access request reaches them whether or not a screen does. Whether *showing* them would improve the data enough to be worth it is still open (§9.3); whether they must be *disclosable* is not, and is part of [#3](https://github.com/cloudexible-org/match.build/issues/3).
- **Candidate messages are untrusted input** (§4.1). Instructions inside them are content, never commands.

## 8. Build order

**Where it lands.** One new domain, `convex/facts/` (`rules.ts` carrying the key registry, plus mutations, queries and helpers per `CLAUDE.md`). Everything else extends a domain phase 1 already built: reply suggestions and the summariser go in `messages/`, the voice profile in `matchmakers/`, the welcome trigger in `invites/`, the agent actor and the new actions in `audit/`, and the erasure branch for `facts` in `admin/`.

0. **Choose the LLM provider** (§9.1) — before [#1](https://github.com/cloudexible-org/match.build/issues/1)'s DPA is drafted, not before this step.
1. Voice samples in settings + reply suggester (streaming, debounce, stale handling).
2. Facts schema, key registry, manual facts in the Profile tab, audit integration — **and the `facts` branch of the erasure in the same change** (§3).
3. Extractor + reconciler + auto-apply/suggest + undo.
4. Extraction from the imported history at onboarding.
5. Summariser.
6. Eval harness.

---

## 9. Open questions

The first draft listed eleven of these flat, which made a number that wants a week with a real matchmaker look like a blocker, and made two genuine blockers look like preferences. They sort into three kinds.

### 9.1 Must be settled before any code

- **LLM provider and models**, for the foreground and background jobs, with no training on inputs and a documented retention period. **⏰ This one is not on this phase's clock.** The provider is a sub-processor the DPA in [#1](https://github.com/cloudexible-org/match.build/issues/1) has to name, and amending a signed DPA means going back to every matchmaker who signed it. Decide it **before those terms are drafted**.
- **Prompt injection and leakage.** Not "is a system-prompt guardrail enough" — that framing invites a yes. Special-category data, plus an LLM drafting messages a human sends under their own name, is the one place in this product where a leak harms a real person. It needs a mechanism: what checks a suggestion before it can reach the Send button, and what a failed check does.
- **Key registry contents, and who owns adding keys** (§3.1). Phase 3's hard filter runs on these keys, so changing one later is a migration rather than an edit.
- **Eval data.** Where realistic but synthetic or consented conversations come from (§4.2). The reconciler cannot be built honestly without them, and it must never be raw candidate data.

### 9.2 Ship as a setting, tune with the pilot

None of these blocks a line of code: each ships as a deployment env var with the value below as its default, exactly as phase 1's notification delays did (§6).

| Setting | Starting value | Why it's a guess |
|---|---|---|
| Auto-apply threshold | 0.8 | Too low is presumptuous, too high nags. Nobody knows which until a matchmaker is annoyed by one of them. |
| Suggested replies shown | 3 | Three may be choice paralysis on a phone. |
| Debounce window | ~5 s | Depends how people actually type in bursts. |
| Voice samples required | 20 sent messages | Unknown whether fewer already stops sounding generic. |
| Live window | 20 messages | Trades summariser cost against continuity. |
| Per-matchmaker AI budget | — | Both the limit *and* what happens when it's hit: degrade to no suggestions, or tell them? |

### 9.3 Open product question

- **Fact visibility to candidates.** Currently none. Would letting a candidate review and correct their own profile improve the data enough to be worth it? This is the only item here that changes the product's shape rather than a number, and it is a product question only — the legal half is settled (§7) and swept in [#3](https://github.com/cloudexible-org/match.build/issues/3).

*Closed by §4C:* whether the AI may ever change a manually entered fact. It may suggest, never auto-apply.
