# Phase 3 — Matching

**Status:** Draft. Needs design, especially the introduction moment (§6), before building.
**Depends on:** [phase-2.md](phase-2.md) — matching runs on structured facts.
**Goal:** help the matchmaker find, track and make introductions within their own book, and let new candidates find matchmakers.

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

## 2. Match board

A separate view, not a panel: reviewing matches is a different mode of work than chatting.

Columns: `Suggested` → `Reviewing` → `Introduced` → `Mutual interest` → `Connected`.

- `Rejected` is a **lane**, not a terminal column — a card can drop into it from any stage. Capture who rejected and why on the way in; that is taste signal. Rejected cards age out of the board after a period.
- Manual match creation lives on this board and produces an identical `matches` record with `origin: "manual"`.
- The `Introduced → Mutual interest` transition depends on two separate yeses (`candidateAResponse`, `candidateBResponse`). Handle as sub-state on the card rather than adding columns.
- Every stage change is audited on both candidates' trails.

## 3. Discover page and applications

- A public directory of matchmakers a signed-in account can browse.
- **Apply** creates a `membershipRequests` row with `kind: "application"`, `requesterUserId` and an optional `message` (the table already exists from phase 1).
- The matchmaker sees applications in their workspace and approves or declines. Approval creates the `candidates` row (`membership: "joined"`) and its conversation.
- Open: what a matchmaker's public profile contains, and whether matchmakers opt in to being listed.

## 4. Data model (proposed)

```ts
matches: defineTable({
  matchmakerId: v.id("matchmakers"),
  candidateAId: v.id("candidates"),
  candidateBId: v.id("candidates"),
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
  candidateAResponse: v.optional(v.union(v.literal("pending"), v.literal("yes"), v.literal("no"))),
  candidateBResponse: v.optional(v.union(v.literal("pending"), v.literal("yes"), v.literal("no"))),
  rejectedBy: v.optional(v.union(v.literal("matchmaker"), v.literal("candidateA"), v.literal("candidateB"))),
  rejectionReason: v.optional(v.string()),
  outcome: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_matchmaker_stage", ["matchmakerId", "stage"])
  .index("by_candidateA", ["candidateAId"])
  .index("by_candidateB", ["candidateBId"]),
```

Open: enforce one match per unordered pair (store the pair in a fixed order).

## 5. Agents

Reuse phase 2's "foreground emits signal → background worker processes it" mechanism:

- **Match candidate generator:** cheap pre-filter on `hard_constraint` facts, then AI compatibility reasoning on the shortlist; writes `suggested` matches with score and reasoning.
- **Reminders agent:** surfaces follow-ups (stale conversations, pending introduction responses).

## 6. Open questions

- **The introduction moment.** What exactly gets shared with each party, how much of the other's profile, and does the introduction happen through the platform or hand back to the matchmaker's own channels? This is the product's payoff moment and needs design before phase 3 starts.
- **Discover page:** listing criteria, public profile content, spam/abuse controls on applications.
- **Rejected lane ageing period.**
- **Outcome capture:** what outcomes do we record, and when do we ask?
