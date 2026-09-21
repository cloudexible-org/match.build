# Phase 3 — Matching

**Status:** Draft, **except §2, §4 and the first half of §5, which are built** — see
[Built so far](#built-so-far). The rest still needs design, especially the
introduction moment (§6).
**Depends on:** [phase-2.md](phase-2.md) — matching runs on structured facts. **The dependency is only half met, and the board was built anyway.** Phase 2 built the `candidateProfiles` those facts live in, and the board reads them (`matches/helpers.ts`: a candidate with no facts is left out of the run rather than scored against everyone at zero). What phase 2 has *not* built is the extractor that fills a profile from the conversation, so every fact the scorer reads today was typed by a matchmaker by hand. That is the right order — a scorer that could not be fed by hand could not be checked by hand either — but it means the board's usefulness is capped by how much somebody has typed, and phase 2 step 3 is what lifts that cap.
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
| `reasoning: string` | `signals: {key, weight, earned, detail}[]` | The arithmetic the run did, rather than prose about it. The draft's two response
fields are gone with the column they fed. A card shows the strongest few and the weakest one. |
| Five columns + a Rejected lane | Three columns + a `closed` state off the board | Two columns described the matchmaker, not the match; and a rejection and a wedding are one event (§2). |
| `candidateAResponse` / `candidateBResponse` | gone | A no ends the match and is recorded on the closing record; a yes is implied by the matchmaker doing the next thing. |
| `rejectedBy` + `rejectionReason` + `outcome` | `closedAs` + `closedBy` + `closingNote` | One closing record, because there is one way a match ends. `system` is the nightly run taking its own suggestion back. |
| *Open:* one match per unordered pair | `pairKey`, unique | The ids are stored sorted; the pair is the key. It is what stops tonight's run re-suggesting last night's pair. |
| *Open:* rejected lane ageing period | No lane, so nothing ages | Closed matches sit behind a summary line: out of the way rather than out of reach. |
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

Columns: `Proposed` → `Introduced` → `Connected`. **Three, because each one is
something that happened between two people.**

The draft had five. Two of them described the matchmaker rather than the match
and are gone: `Reviewing` was a state of mind, and `Mutual interest` was a fact
`Connected` already implies — nobody puts two people in touch before both have
said yes. What `Reviewing` was really for, telling a card you have read from one
you have not, is a property of a card and is now a dot on it.

- `Introduced` means the matchmaker showed each of them the other, one at a
  time. `Connected` means they put the two in touch with each other. Both are
  things the matchmaker did and then recorded; the app sends nobody anything
  (§6).
- **A match that has ended leaves the board.** One `closed` state, carrying an
  outcome — `together` or `didnt_work` — plus who ended it where somebody did
  (the matchmaker, either candidate, or `both` — neither of them wanting it is
  a different fact from one of them not wanting it), and a note. A rejection and a wedding are the same event, so there is no
  Rejected lane at one end of the board and no "married" column at the other;
  there is a line under the board that counts what is closed, and opens it.
  Nothing ages out, because nothing needs hiding.
- **The note is required for a no and optional for a yes.** Why a match failed
  is the taste signal the board exists to collect; making somebody write a
  sentence about good news is how good news stops getting recorded.
- Closing as `together` **offers to archive both candidates**, through the same
  status a matchmaker sets by hand. It stays their call: a couple can also break
  up.
- Manual match creation lives on this board and produces an identical `matches`
  record with `origin: "manual"`.
- Every stage change is audited on both candidates' trails.

## 3. Discover page and applications

- A public directory of matchmakers a signed-in account can browse.
- **Apply** creates a `candidates` row in that matchmaker's book with `membership: "applied"`, `userId` set to the applicant, and an optional message (a new optional field). One row per (matchmaker, user) still holds, so a person can't apply twice.
- The matchmaker sees applications in their workspace and approves (`joined`, and the conversation is created) or declines (`declined`). Both are audited.
- Open: what a matchmaker's public profile contains, and whether matchmakers opt in to being listed.
- **The route exists and the feature does not.** `/c/mm/discover` (`apps/app/src/pages/discover.tsx`) renders a card saying the directory isn't open and pointing the reader back to their matchmakers, and **nothing in the UI links to it** — the only way into a book is still an invitation (prd/phase-1.md §3.2), and `candidates` has no `applied` membership. It is the shell this section's work lands in, kept so that a candidate who reaches it by hand gets an answer rather than a 404.

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
  stage: matchStage,                  // proposed | introduced | connected | closed
  stageChangedAt: v.number(),
  score: v.optional(v.number()),      // 0..100
  coverage: v.optional(v.number()),   // 0..1 — how much profile the score read
  signals: v.optional(v.array(matchSignal)),  // {key, weight, earned, detail}
  checkDealbreakers: v.optional(v.boolean()), // free text no filter reads
  algorithmVersion: v.optional(v.number()),
  lastScoredAt: v.optional(v.number()),
  // What closing recorded. Cleared if the card comes back onto the board.
  closedAs: v.optional(matchOutcome),             // together | didnt_work
  closedBy: v.optional(matchClosedBy),            // …| system
  closingNote: v.optional(v.string()),
  seenAt: v.optional(v.number()),   // absent means new — what `Reviewing`
                                    // used to say with a whole column
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
- ~~**Rejected lane ageing period.**~~ There is no lane. A closed match sits
  behind a summary line under the board, and stays there.
- **Outcome capture:** *partly answered.* Closing a match records one of two
  outcomes and a note, and the matchmaker is asked at the moment they close it.
  Whether two is the right number — whether `engaged`, `married` and `stayed
  friends` earn their place — is open, and wants a real matchmaker rather than
  a guess.
