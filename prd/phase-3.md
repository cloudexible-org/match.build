# Phase 3 — Matching

**Status:** Draft, **except §2, §4 and the first half of §5, which are built** — see
[Built so far](#built-so-far). The rest still needs design, especially the
introduction moment (§6).
**Depends on:** [phase-2.md](phase-2.md) — matching runs on structured facts.
**Goal:** help the matchmaker find, track and make introductions within their own book, and let new candidates find matchmakers.

---

## Built so far

The match board and the **first stage of the matching pipeline**: the hard
filter and a weighted score, both deterministic, in `convex/matches/rules.ts`.
**There is no AI in it at all** — the second stage below (§5) is not built, and
the board is useful without it. Every card can be explained to a matchmaker
line by line, and the same book scored twice gives the same answer twice.

Three rules hold the algorithm together, and are worth keeping when the AI
stage lands:

1. **Missing data never disqualifies.** A blank field is something nobody has
   recorded, not a "no". Every filter needs both halves of itself on the record.
2. **Every score is symmetric**, because a pair is unordered. One-sided
   preferences are evaluated both ways and averaged.
3. **A score is only as good as its coverage.** Two near-empty profiles agree
   about everything, so a card needs a score *and* enough profile behind it.

What changed from the draft below, deliberately:

| Draft | Built | Why |
|---|---|---|
| `origin: "ai"` | `origin: "algorithm"` | Nothing about a card came from a model. |
| `reasoning: string` | `signals: {key, weight, earned, detail}[]` | The arithmetic the run did, rather than prose about it. A card shows the strongest few and the weakest one. |
| `rejectedBy: matchmaker \| candidateA \| candidateB` | plus `system` | The nightly run withdrawing its own suggestion is the one rejection nobody chose, and worth telling apart from the three somebody did. |
| *Open:* one match per unordered pair | `pairKey`, unique | The ids are stored sorted; the pair is the key. It is what stops tonight's run re-suggesting last night's pair. |
| *Open:* rejected lane ageing period | A month, **in the view only** | The row and its reason stay for good: the reason is the taste signal. |
| `score`, no notion of confidence in the data behind it | plus `coverage` | Rule 3 above needs somewhere to live. |

**Not built, and named here so it isn't mistaken for missing:** the AI second
stage (§5), anything candidate-facing — the board records the two yeses as the
matchmaker *heard* them, and nothing is sent to either party (§6) — outcome
capture beyond a free-text field, the Discover page (§3), and the reminders
agent.

---

## 1. Scope

1. **Match board** (Kanban) with AI-generated match candidates.
2. **Two-stage matching pipeline:** hard filter on `hard_constraint` facts → AI compatibility reasoning.
3. **Match lifecycle**, introduction flow, outcome capture.
4. **Manual match creation.**
5. **Discover page:** candidates browse matchmakers and apply to join.
6. **Reminders / follow-up agent.**
7. **Cross-conversation retrieval** surfaced inline in chat.
8. **Dedicated voice-distillation agent** (refines phase 2's voice job).

Matches are always **within one matchmaker's book**. Facts from one matchmaker's candidates are never used for another's.

---

## 2. Match board — built

A separate view, not a panel: reviewing matches is a different mode of work than chatting.

Columns: `Suggested` → `Reviewing` → `Introduced` → `Mutual interest` → `Connected`.

- `Rejected` is a **lane**, not a terminal column — a card can drop into it from any stage. Capture who rejected and why on the way in; that is taste signal. Rejected cards age out of the board after a period.
- Manual match creation lives on this board and produces an identical `matches` record with `origin: "manual"`.
- The `Introduced → Mutual interest` transition depends on two separate yeses (`candidateAResponse`, `candidateBResponse`). Handle as sub-state on the card rather than adding columns.
- Every stage change is audited on both candidates' trails.

## 3. Discover page and applications

- A public directory of matchmakers a signed-in account can browse.
- **Apply** creates a `candidates` row in that matchmaker's book with `membership: "applied"`, `userId` set to the applicant, and an optional message (a new optional field). One row per (matchmaker, user) still holds, so a person can't apply twice.
- The matchmaker sees applications in their workspace and approves (`joined`, and the conversation is created) or declines (`declined`). Both are audited.
- Open: what a matchmaker's public profile contains, and whether matchmakers opt in to being listed.

## 4. Data model (as built)

The table itself is `packages/api/convex/schema.ts`, with the comments that
explain it; this is its shape.

```ts
matches: defineTable({
  matchmakerId: v.id("matchmakers"),
  candidateAId: v.id("candidates"),   // the pair, stored with its ids sorted
  candidateBId: v.id("candidates"),
  pairKey: v.string(),                // "<lower id>:<higher id>", unique
  origin: v.union(v.literal("algorithm"), v.literal("manual")),
  stage: matchStage,                  // suggested … connected, and rejected
  stageChangedAt: v.number(),
  score: v.optional(v.number()),      // 0..100
  coverage: v.optional(v.number()),   // 0..1 — how much profile the score read
  signals: v.optional(v.array(matchSignal)),  // {key, weight, earned, detail}
  checkDealbreakers: v.optional(v.boolean()), // free text no filter reads
  algorithmVersion: v.optional(v.number()),
  lastScoredAt: v.optional(v.number()),
  candidateAResponse: v.optional(matchResponse),  // pending | yes | no
  candidateBResponse: v.optional(matchResponse),
  rejectedBy: v.optional(matchRejectedBy),        // …| system
  rejectionReason: v.optional(v.string()),
  outcome: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index("by_matchmakerId_and_stage", ["matchmakerId", "stage"])  // the board
  .index("by_matchmakerId", ["matchmakerId"])   // what the nightly run reads
  .index("by_pairKey", ["pairKey"])             // "are they already on it?"
  .index("by_candidateAId", ["candidateAId"])
  .index("by_candidateBId", ["candidateBId"]),
```

`createdAt` is `_creationTime`, and the draft's `reasoning` is `signals`: the
arithmetic the run actually did, rather than prose about it.

## 5. Agents — the first half is built, without an agent

Reuse phase 2's "foreground emits signal → background worker processes it" mechanism:

- **Match candidate generator:** cheap pre-filter on `hard_constraint` facts, then AI compatibility reasoning on the shortlist; writes `suggested` matches with score and reasoning.
  - *Built:* the pre-filter and a weighted score, as a nightly cron that fans
    out one transaction per book (`convex/crons.ts`, `convex/matches/`). It
    only ever revises its own untouched suggestions, which is what makes it
    safe to run every night. The AI reasoning on the shortlist is not built;
    when it lands it reads the same `signals` the score already records.
- **Reminders agent:** surfaces follow-ups (stale conversations, pending introduction responses).

## 6. Open questions

- **The introduction moment.** What exactly gets shared with each party, how much of the other's profile, and does the introduction happen through the platform or hand back to the matchmaker's own channels? This is the product's payoff moment and needs design before phase 3 starts. **Still open, and the board is built around its being open:** moving a card to Introduced sends nobody anything, and the two yeses are what the matchmaker heard, written down.
- **Discover page:** listing criteria, public profile content, spam/abuse controls on applications.
- ~~**Rejected lane ageing period.**~~ A month, and in the view only — the row
  and the reason it holds stay for good.
- **Outcome capture:** what outcomes do we record, and when do we ask? The
  field is there and a connected card can be given free text; the question of
  what we should be *asking* for is still open, which is why nothing asks.
