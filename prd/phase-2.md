# Phase 2 — AI assistance

**Status:** Draft. The design below is proposed, not agreed. Settle the open questions (§9) before building.
**Depends on:** [phase-1.md](phase-1.md) shipped and used by a real matchmaker.
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

```ts
// Added to convex/schema.ts in phase 2

matchmakers: {
  // …phase-1 fields
  voiceProfile: v.optional(v.string()),          // distilled prose description of tone/style
  voiceSamples: v.optional(v.array(v.string())), // pasted in matchmaker settings
}

conversations: {
  // …phase-1 fields
  summary: v.optional(v.string()),               // rolling summary of messages outside the live window
  summarisedThroughSeq: v.optional(v.number()),
}

messages.source: add v.literal("ai_suggestion")  // matchmaker sent an AI suggestion (edited or not)

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
  createdAt: v.number(),
}).index("by_conversation_status", ["conversationId", "status"]),

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
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_candidate_status", ["candidateId", "status"])
  .index("by_candidate_key", ["candidateId", "key"]),
```

**Modelling notes:**

- Facts are discrete records, not a profile blob. Reconciliation, provenance, supersession, and later retrieval all depend on it. Do not "simplify" this into a JSON document.
- A fact a candidate contradicts is never deleted: it is marked `superseded` and linked forward. The history of change is matchmaking signal ("was certain about kids in March, wavering in September").
- There is no in-place update. Every change produces a new fact plus an audit event, so every change can be undone from the audit trail.
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

They communicate **through the database**, never by sharing context. Background work goes through one reusable scheduling mechanism (Convex scheduler / workpool), which phase 3's match and reminder agents reuse.

**A. Reply suggester** (foreground, latency-sensitive)
- Trigger: a candidate message, **debounced** (~5 s after the last one, so a burst of messages produces one generation). Also once when a candidate accepts, for a welcome message.
- Input: system prompt + voice profile + active facts for this candidate + conversation summary + last N messages (including private imported history).
- Output: 1–3 replies, streamed into a `replySuggestions` row.
- Earlier `ready` suggestions become `stale` when a new message arrives or the matchmaker replies manually.
- Never receives other candidates' data.

**B. Fact extractor** (background, cheaper model)
- Separate from the reply suggester, so structured extraction never slows the streamed replies.
- Trigger: each candidate message, and the imported history at onboarding.
- Output: candidate facts, each with category, key (if any), value, text, confidence and a verbatim source quote.

**C. Fact reconciler** (background)
- Runs once per message over all its candidate facts together, serialised per candidate (one job at a time). Parallel per-fact jobs would race: two facts from one message could both add a duplicate or both supersede the same fact.
- Input: the candidate facts + source message text + the candidate's `active` and `suggested` facts, plus recently `rejected` ones (so dismissed suggestions don't keep coming back).
- Output per fact: `ADD`, `DISCARD_DUPLICATE`, or `SUPERSEDE(id)`.
- Auto-applies when confidence ≥ threshold (start at 0.8); otherwise writes `status: "suggested"`.
- Never auto-supersedes a `manual` fact: that change is always a suggestion.
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
- **Candidate panel:** a **Profile** tab (becomes the default): active facts grouped by category, source quote on hover/expand, manual add/edit/remove, a pending section for suggested facts.
- **History tab:** gains fact and agent entries, with a link to the source message and Undo where possible. New filter: Profile.
- **Matchmaker settings:** voice samples.

## 6. Non-functional requirements

- **Suggested-reply latency:** first token under ~2 s. Stream. On failure, fail silently.
- **Cost control:** keep the reply suggester's context tight; background jobs use a cheaper model; rate-limit AI calls per matchmaker.
- **Audit:** every auto-applied fact is undoable and shows provenance.

## 7. Privacy

- Use an LLM provider and API tier with no training on inputs and a documented retention period.
- Facts are private to the matchmaker. Candidates never see them.

## 8. Build order

1. Voice samples in settings + reply suggester (streaming, debounce, stale handling).
2. Facts schema, key registry, manual facts in the Profile tab, audit integration.
3. Extractor + reconciler + auto-apply/suggest + undo.
4. Extraction from the imported history at onboarding.
5. Summariser.
6. Eval harness.

---

## 9. Open questions

- **LLM provider and models** for the foreground and background jobs; data retention terms.
- **Auto-apply threshold.** 0.8 is a guess. Too low feels presumptuous, too high nags.
- **Suggested-reply count.** 1 vs 3. Three may be choice paralysis on mobile.
- **Voice cold start.** How many samples, and are they enough for suggestions not to feel generic?
- **Manual facts.** Should the AI ever change a manually entered fact, even as a suggestion?
- **Key registry contents.** Is the starting set right? Who owns adding keys?
- **Debounce timing** for bursts of candidate messages.
- **Prompt injection and leakage.** Is a system-prompt guardrail enough, or do suggested replies need a check before the Send button?
- **Per-matchmaker AI budget.** What limit, and what happens when it's hit?
- **Fact visibility to candidates.** Currently none. Would letting a candidate review and correct their own profile improve data quality enough to be worth it?
- **Eval data.** Where do realistic but consented or synthetic conversations come from?
