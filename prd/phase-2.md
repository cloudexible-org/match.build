# Phase 2 — AI assistance

**Status:** Partly built. Build steps 0–3 are shipped (§8): the AI plumbing and `/admin/ai` (§4.3, §4.4), profiles and voice (§3), the reply suggester (§4A), and **all three agents now write** — the profile agent fills a candidate's record from the conversation (§4.1B) and the voice agent drafts a matchmaker's voice from their own messages (§4.1C). Sections are marked *built* where they describe what shipped; everything else is proposed, not agreed. **What is left:** extraction from the imported history at onboarding (step 4), the eval harness (step 5), and the welcome draft on acceptance. §9 sorts the remaining questions into what must be settled before any code, what ships as a setting and gets tuned with the pilot, and what is still an open product question.
**Depends on:** [phase-1.md](phase-1.md) shipped *and used by a real matchmaker* — which is gated on the terms in [#1](https://github.com/cloudexible-org/match.build/issues/1), not on engineering. The AI plumbing itself is built (§4.3), and two features now sit on top of it — which is why §9.1's prompt-injection bullet is marked overdue rather than pending.
**Data protection:** everything this phase adds is swept in [#3](https://github.com/cloudexible-org/match.build/issues/3) before v1 ships. A profile is the matchmaker's own record, like their notes were (§7).
**Goal:** make the matchmaker faster and sharper inside the conversation they already run in the app: suggested replies in their voice, and a candidate profile that builds itself from the conversation.

**Principle:** AI is never blocking. If any of this fails, phase 1 still works exactly as before.

---

## 1. Scope

1. **Reply suggestions (§4A, built):** a candidate writes, and a few seconds later the matchmaker has one to three drafts waiting above the composer, in their own voice, each with **Send**, **Edit** and **Dismiss** — plus a switch to turn them off for one conversation. The welcome draft on acceptance is the one part not built.
2. **Candidate profiles (§3, built):** a structured record per candidate — registry-typed facts and free-text notes — with a per-field rule about who may write it, provenance on every value, and an agent's proposal sitting beside a value rather than replacing it. **The extraction that feeds it is built** (§4.1B): what a conversation reveals reaches the record without anyone typing it.
3. **Profile section (built)** in the candidate panel: filled fields grouped by the registry, their source and quote, manual add/edit/clear, and suggestions above the record.
4. **Voice (§3, built)** in matchmaker settings, one `suggest` field the voice-profile agent may draft but never change under them. **The agent that drafts it is built** (§4.1C): it reads their own sent messages every N of them and offers a description of how they write.
5. **Eval harness** for reconciliation. Not built, and blocked on where its data comes from (§9.1).

**Thread summaries are not in v1.** A long thread is simply read from its last
50 messages and no further back. The summariser was the answer to "what happens
to message 51", and the honest v1 answer is that nothing does: a matchmaker
drafting a reply is working from the last few exchanges, and a derived artefact
that has to be kept correct, kept fresh and kept honest is a large thing to
build on a guess about how much older context is worth. It comes back when a
real thread is long enough to show what is missing.

Every profile change and voice change is written to the phase-1 audit trail, with the agent as the actor where it made the change.

---

## 2. Conversation experience — drafting is built, extraction is not

- *Built.* On each message (debounced, §4A), the reply suggester produces 1–3 suggested replies, each with **Send**, **Edit**, **Dismiss**. A matchmaker must never mistake an AI suggestion for something the candidate said — and where the draft said "rendered inline", what shipped is **a stack above the composer**, between the thread and the input, which is stronger: a card that never sits in the message list can never be read as a message. One row per kind of suggestion, at most one card per row (§5).
- *Built.* **A switch per conversation**, in the thread header. Absent means on, so only the exception is stored. Turning it off retires the drafts on offer, cancels the pending job and deletes the agent's thread; turning it back on starts again from nothing rather than from a fortnight it did not watch.
- *Not built.* When a candidate accepts an invitation, a suggested welcome message appears. The trigger belongs in `convex/invites/` and is not wired: today the only thing that schedules a draft is a message being sent (`messages/mutations.ts`).
- *Built.* Fact extraction runs in the background. What the agent may write it writes, and what it may only propose lands in the Profile section — and in the stack above the composer — as a suggestion (§3.2); the field's policy decides, not the model's confidence.
- *Built, and the point of the principle.* The composer always works without AI. Every way out of the drafting run is quiet: the agent may be off, the deployment may have no gateway, the model may refuse — and in all of them the matchmaker simply has no drafts.

---

## 3. Data model additions

Written in the conventions `packages/api/convex/schema.ts` actually uses, which are not the ones the first draft of this file guessed at: rows have no `createdAt` (Convex's built-in `_creationTime` carries it), and indexes name every field in full, joined with `_and_` — `by_conversationId_and_seq`, not `by_conversation_seq`.

**This section replaced an earlier `facts` design** — one row per fact, with `confidence`, `status`, `supersededBy` and a separate key registry. The shape below is simpler and does the same work: the audit trail is already append-only and already records before-and-after per field, so the history of a value does not need supersession rows to exist, and a second copy of that history would be less trustworthy than the one that already refuses to be rewritten. What the old design got right and this one keeps: provenance, a verbatim source quote, and the difference between a value and a proposal.

```ts
// Added to convex/schema.ts

// One value, and everything that is true *about* the value.
const profileEntry = v.object({
  value: v.string(),                 // normalised by profiles/rules.ts; "" = nothing recorded
  source: v.union(                   // who put the current value there
    v.literal("matchmaker"),
    v.literal("agent"),
    v.literal("agent_approved"),
  ),
  updatedAt: v.number(),
  updatedByUserId: v.optional(v.id("users")),
  model: v.optional(v.string()),
  sourceMessageId: v.optional(v.id("messages")),
  sourceQuote: v.optional(v.string()),
  confidence: v.optional(v.number()),
  // An agent's proposal, waiting on the matchmaker. BESIDE the value, never
  // instead of it. At most one open per field: a newer one replaces it.
  pending: v.optional(v.object({
    action: v.union(v.literal("set"), v.literal("clear")),
    value: v.string(),               // "" when the action is "clear"
    suggestedAt: v.number(),
    model: v.string(),
    confidence: v.optional(v.number()),
    sourceMessageId: v.optional(v.id("messages")),
    sourceQuote: v.optional(v.string()),
  })),
});

candidateProfiles: defineTable({
  matchmakerId: v.id("matchmakers"),
  candidateId: v.id("candidates"),
  facts: v.record(v.string(), profileEntry),  // keyed by the registry
  notes: v.record(v.string(), profileEntry),  // keyed by whatever anyone names
  updatedAt: v.number(),
})
  .index("by_candidateId", ["candidateId"])
  .index("by_matchmakerId", ["matchmakerId"]),

matchmakerProfiles: defineTable({
  matchmakerId: v.id("matchmakers"),
  voice: v.optional(profileEntry),
  updatedAt: v.number(),
}).index("by_matchmakerId", ["matchmakerId"]),

// A third variant of the `auditActor` union in schema.ts, alongside `user`
// and `system`. Carries the model, because "the assistant changed this" is
// only half an answer once the model behind an agent has moved on.
auditEvents.actor: add
  v.object({ type: v.literal("agent"), agent: aiAgentId, model: v.string() })

messages.source: add v.literal("ai_suggestion")  // a sent AI suggestion, edited or not

conversations: {
  // The matchmaker's own switch for this conversation (§4A). Absent means on;
  // only the exception is stored, so there is nothing to backfill.
  aiOff: v.optional(v.boolean()),
  // The agent's thread, and how much of the world it has been told about.
  agentThreadId: v.optional(v.string()),
  agentBriefedSeq: v.optional(v.number()),
  agentBriefedVoiceAt: v.optional(v.number()),
  agentBriefedProfileAt: v.optional(v.number()),
  draftJobId: v.optional(v.id("_scheduled_functions")),
}
```

**The `notes` table is gone.** Its timestamped journal is replaced by a keyed `notes.matchmakerNotes` entry. A one-off internal mutation folded the surviving rows into it, oldest first — removed notes stayed removed, since the History tab already records that they were removed — and the table then came out of the schema. Prod held no rows; dev's two were migrated before the narrowing. The `note.*` audit actions stay in the vocabulary because the trail is append-only and those events still have to render.

### 3.1 Why one document per candidate, not one row per fact

- **Every value carries metadata**: who wrote it, when, from which message, and whether a proposal is waiting on it. Forty typed columns would be forty nested objects, and adding a field would be a schema migration every time. The table holds two maps; `convex/candidateProfiles/rules.ts` holds the types. Adding a field is an edit to one file.
- **The cost is that a stored value is a string** — a *normalised* one. `valueError` then `normaliseValue` is the only way a value reaches the database, from a matchmaker's form and from an agent alike, so "yes", "1987-03-14" and "28-36" mean exactly one thing each. Phase 3's hard pre-filter reads these keys, which is why a key, once used, is a migration rather than an edit.
- **Change history is the audit trail**, which was going to be written either way. `profile.updated`, `profile.suggested`, `profile.suggestion_accepted`, `profile.suggestion_rejected`, and the matchmaker-side `matchmaker_profile.*`. Which entry moved is `changes[].field`, written as `facts.wantsKids` or `notes.idealWeekend`, and rendered through the registry so the trail says "Wants children" rather than a key.
- **Erasure** anonymises the identifying and special-category facts — the registry marks them `personal` — and leaves the rest standing, exactly as `status` and `membership` survive in the trail (prd/phase-1.md §12). Free-text notes are **not** redacted, on the same grounds the note and message bodies were left alone: they are the matchmaker's own words. `admin.mutations.eraseAccount` calls `anonymiseCandidateProfile` in the same loop as `anonymiseCandidate`; one row per candidate, so the `memberships` ceiling already bounds it.

### 3.2 Who may write what

Three ways a value gets written, declared **per field in the registry** — not configurable per matchmaker, and not a confidence threshold:

| Policy | The agent may |
|---|---|
| `matchmaker` | nothing. Not write, not propose. |
| `agent` | write it directly. |
| `suggest` | propose only; the value does not move until a matchmaker approves. |

Plus one rule that holds whatever the policy says: **an agent never overwrites what a person typed.** An `agent` field whose current `source` is `matchmaker` degrades to a proposal. A conversation that contradicts something entered by hand is exactly the thing worth telling someone about (`agentWriteMode` in `convex/profiles/rules.ts`).

`matchmaker` is for the matchmaker's own judgement (`incomeBand`, `matchmakerNotes`, `matchmakerTake`). `suggest` is for the special categories and anything a wrong guess costs a real person: `orientation`, `religion`, `politics`, `ethnicity`, `drugs`, `dateOfBirth` — and `voice`, because how someone writes is theirs. A note key nobody has named defaults to `suggest`: a key nobody has thought about is exactly the one an agent should be asking about rather than inventing.

### 3.3 A proposal, and everything that can happen to it

There is **at most one open proposal per field**, and the newest wins. Two open questions about one field is a worse thing to hand someone than the current best answer; the one it replaced reaches the audit trail as a `profile.suggested` event whose `before` names it and whose `reason` says so.

A proposal can be a **removal** as well as a value (`pending.action`), because an agent learns that something has stopped being true as often as it learns what is — and `value: ""` could not say so, since an entry whose value is `""` is one nothing has been recorded for.

What resolves a proposal:

| What happens | The proposal |
|---|---|
| A later agent run proposes something else for the field | replaced; the old one is audited |
| A later agent run proposes the same thing | ignored — it doesn't nag |
| Someone writes a different value | **survives.** Writing a value is not answering the question, and they may never have seen it |
| Someone writes exactly what it proposed | answered — leaving it up would nag about a change already made |
| Someone clears the entry, with a removal proposed | answered |
| Someone clears the entry, with a *value* proposed | **survives** |
| Accepted | applied; the value's `source` becomes `agent_approved` — they agreed with it, they did not write it, and a later run may revise its own work but never theirs |
| Rejected | dropped, and the entry with it when nothing was underneath |

### 3.4 The registry

`convex/candidateProfiles/rules.ts` holds ~48 fields in seven groups — **about them** (birth date, age, gender, pronouns, height, ethnicity, languages, occupation, education, income band), **where they are** (city, country, nationality, relocation, living situation), **relationships** (orientation, status, previous marriages, longest relationship, looking for, timeline), **family** (has kids, how many, at home, wants kids, how many they want, importance), **lifestyle** (smoking, drinking, drugs, diet, exercise, pets), **beliefs** (religion + importance, politics + importance) and **what they're looking for** (seeking gender, partner age and height ranges, kids, religion, education, location, distance, dealbreakers).

Each field declares a value kind — `text`, `date`, `integer`, `range`, `choice`, `choices`, `list` — which is what the form renders and what the server validates. Splitting *them* from *what they want* matters because phase 3 matches one side against the other.

Free-text note keys are open. The registry names eleven suggested ones (`idealWeekend`, `hobbies`, `whatTheyreLookingFor`, `matchmakerNotes`, …) with labels and policies; anything else is allowed, labelled by humanising the key, and policed as `suggest`.

`convex/matchmakerProfiles/rules.ts` holds one field, `voice`, under the same rules. Named columns rather than a map, because what the product knows about a matchmaker is a short deliberate list rather than a bag that grows with whatever a conversation turns up.

### 3.5 Where it lives

Two domains and a shared kernel, which is one more directory than `CLAUDE.md` §8's one-per-domain but the honest shape: `convex/candidateProfiles/` and `convex/matchmakerProfiles/` each own a table and its functions, and `convex/profiles/` registers **no functions at all** — it holds the entry type, validation and the write engine, so "an agent never overwrites what a person typed" means the same thing for a candidate's birth date and a matchmaker's voice.

A fourth writer — **the candidate editing their own profile** — is deliberately absent rather than stubbed (§9.3). It would be a policy the registry grows and a `writer` the mutations pass; nothing else would move.

## 4. Agents and jobs — §4A is built, §4B and §4C are proposed

They communicate **through the database**, never by sharing context. Phase 3's match and reminder agents reuse the same mechanism.

**Components, not hand-rolled plumbing.** Three of the four things this phase needs around an LLM call already exist as Convex components, and phase 1 hand-rolled nothing it didn't have to. **One of the four is installed**, and the table says what each of the others is still waiting for — they were listed here as decisions, and three of them have not been made yet:

| Component | What it does here | State |
|---|---|---|
| `@convex-dev/agent` | Threads, message history, tool calls and usage tracking for the AI side. | **Installed** (§4.3), and **used** by §4A — one thread per conversation, deleted when the switch goes off. |
| `@convex-dev/workpool` | Every background job below. Gives §4B its "one job per candidate at a time" as configuration rather than as a lock invented in a profile row. | Not installed, **and §4B shipped without it** — so the serialisation it was meant to provide is not there. In practice §4B inherits §4A's debounce, because it is scheduled from the drafting run and there is at most one of those in flight per conversation; two runs can still overlap if a second burst arrives while the first is generating. The damage that does is bounded rather than absent: a field holds at most one open proposal (§3), so the later run replaces the earlier one's suggestion instead of queueing behind it, and the audit trail keeps what it replaced. Install it when a second thing schedules a profile run, which step 4 will be. |
| `@convex-dev/persistent-text-streaming` | §4A's streamed replies. A mutation per token is a database write per token, which is what "streamed into a `replySuggestions` row" would otherwise mean. | Not installed, **and §4A shipped without it** — one `generateText` per run, drafts written in one mutation when they are all there. See §6, where the latency requirement this was the answer to is restated as what actually happens. |
| `@convex-dev/rate-limiter` | §6's per-matchmaker AI budget. | Not installed. The budget is still an open question rather than an unimplemented number (§9.2), so there is nothing to enforce yet. |

**`@convex-dev/agent`, on one condition.** An earlier draft of this section ruled it out, on the grounds that it brings its own threads and messages tables while the product already has `conversations` and `messages` that are tenanted, audited, read-markered, notification-driving and erasure-aware. The first half of that is true and the conclusion was wrong: the component's thread is the *model's* record of a conversation, not the product's, and the two can coexist as long as one of them is unambiguously the source of truth.

So: **`conversations` and `messages` stay the product's source of truth.** Nothing the UI renders, nothing a notification fires from, and nothing a matchmaker keeps comes out of a component table. An agent thread is the context the model is given, downstream of the real thread and rebuildable from it.

The condition is the one that made the earlier draft nervous, and it is concrete rather than a matter of taste: **a component's tables are invisible to `ctx.db`**, so `admin.mutations.eraseAccount` cannot walk them the way it walks `candidates` and `auditEvents`. The component has its own door — `components.agent.users.deleteAllForUserId` — and an erasure has to knock on it.

> **The condition was crossed once and is now met.** This section used to end "nothing creates a thread until that is wired", and for three days that was untrue: §4A created one per conversation while `eraseAccount` still did not knock. It does now — `forgetAgentThread` (`replySuggestions/helpers.ts`) walks a person's conversations and deletes every thread on them, and the erasure page reports how many it deleted. A test seeds real threads in the component's own tables and proves they are gone afterwards; it fails if the call is removed.
>
> **The door §4 named is not the one that fits**, and that is worth recording rather than silently working around. `components.agent.users.deleteAllForUserId` keys on a component user id, and the threads this product creates carry none — they are per conversation, not per person. Giving them one would have worked for every thread created after the change and silently missed every one created before it. Walking the conversations is exact, needs no backfill, and is bounded by the membership ceiling the erasure already enforces.
>
> **Every thread this phase creates has to be on that walk.** There are two per conversation now (§4.1B), and the per-conversation switch and the erasure both forget both. A third agent thread added later and not added there is the same defect again, and it will not announce itself: the component's tables are invisible to `ctx.db`, so nothing in the product can notice the copy that was left behind. Swept in [#3](https://github.com/cloudexible-org/match.build/issues/3).

`@convex-dev/rag` is worth a look in phase 3 for cross-conversation retrieval, not here.

### 4.1 Three agents, and what each one owns

An earlier draft listed five jobs (A reply suggester, B fact extractor, C fact reconciler, D voice-profile job, E summariser — since dropped from v1). The rest collapse into **three agents**, which is the better cut: it separates *reading* a conversation and proposing from *owning the write path* to a record. The five-job split had two agents on the read side and left the write path as a step rather than an owner.

| Agent | Owns | Absorbed |
|---|---|---|
| `conversation` | Reading one thread: drafting a reply, noticing facts. Proposes; writes nothing to a record. | A + B |
| `candidate_profile` | The write path to a candidate's facts. | C |
| `voice_profile` | The write path to the matchmaker's voice profile — and to everything the product learns about the matchmaker. | D |

**There is no summariser in v1.** It would have read the same thread to write another derived artefact on a different trigger, and it is the piece v1 does without: the live window is the whole of what the agent sees.

**What the product learns about the *matchmaker* lands in their voice.** `candidateProfiles` stays keyed to a candidate, and `matchmakerProfiles` is where the other half goes. So `voice` is wider than its name suggests: not only how they write, but how they work and what they care about in a match. Take this paragraph as its definition, and `convex/matchmakerProfiles/rules.ts` as where it is written down.

**Each agent has one model and one standing instruction, platform-wide, stored in the database and edited at `/admin/ai`** (§4.4). A matchmaker's own character does not vary the prompt — it is the voice profile, which is *data a prompt reads*.

**A. `conversation`** — *built*, in `convex/replySuggestions/`, for the drafting half
- Trigger: a message, **debounced** (`AI_REPLY_DEBOUNCE_SECONDS`, ~5 s after the last one, so a burst produces one generation). The pending job is cancelled and replaced on each send, which is what makes the window slide rather than fire on the first message of a burst. *Not built:* the welcome draft when a candidate accepts, which belongs in `convex/invites/`.
- Input: the standing prompt + voice profile + the candidate's whole profile, facts *and* the matchmaker's own notes + last N messages (including the private imported history and the matchmaker's private notes to themselves).
- **The thread is the memory, so the input is sent once and then kept up to date.** The first run briefs the agent with all of the above; every run after it sends only what has changed — the new messages, a voice that was rewritten, profile entries that moved. Re-sending the world each time pays twice for what the thread already holds, and buries the new message under text the model has read four times.
- Output: 1–3 replies (`AI_REPLY_COUNT`), **and** what the messages revealed, each with the candidate's verbatim words. One generation, two labelled sections — `REPLIES` first, because it is the half a matchmaker sees. §4.4 warns that one prompt serving two tasks serves neither, and the answer is that the *standing instruction* still describes one agent while the *task* asks for both, over text it has just read anyway; a second call over the same messages would have paid twice for the same reading.
- **A model that ignores the headings has still written drafts.** The whole text falls through to the replies parser and nothing is noticed, which is exactly the feature as it shipped before extraction existed. An observation with no quote is dropped rather than kept: the quote is what a matchmaker checks a proposal against, and an observation nobody can trace to a message is the confident invention this pipeline must not launder into a profile.
- Live window: last **50** messages verbatim (`AI_REPLY_LIVE_WINDOW`), and nothing older. With no summariser (§2), message 51 is simply not seen — which is the v1 trade, and the reason the window is 50 rather than 20.
- Earlier `ready` suggestions become `stale` when a new message arrives or the matchmaker replies manually. Marked, never deleted: what was offered and passed over is worth more than the row costs, and a `sent` draft needs somewhere to have come from.
- Never receives another candidate's data.

**B. `candidate_profile`** (background) — ***built*** *(`candidateProfiles/actions.ts`), on the write path §3 already had.*
- Runs once per drafting run over all the facts the conversation agent noticed, **scheduled rather than awaited**: reconciling is a second model call, and a matchmaker waiting on their drafts must never be waiting on a profile they did not ask about. It is also what keeps a failure in here away from the drafts.
- *Departed from the draft:* no `workpool`, so the per-candidate serialisation is §4A's debounce rather than a queue — see the component table in §4 for what that does and does not cover.
- **Its own thread, not the drafting one.** A drafting thread's history is the context the next reply is written in, and a turn spent arguing about registry keys is not something a reply should be written in the shadow of. The cost is one extra briefing per conversation; the benefit is that neither agent's context is the other's leftovers. Both threads are forgotten together by the switch and by an erasure (§4).
- Input: those candidate facts + the source message + the candidate's current profile, including any open proposals, so it does not keep asking the same question.
- Output per entry: a registry key and a value, or a removal. It does **not** say whether to write or to suggest — `candidateProfiles.mutations:applyAgentEntries` decides that from the field's policy, and an agent that could choose would make the policy advisory. The prompt does not contain the words *suggest* or *propose*, and a test asserts it does not.
- **The registry is in the prompt, minus what it may not touch.** Every field it may write, with the shape its value must take; the keys the registry reserves for the matchmaker are left out entirely rather than listed and forbidden, because listing a field only to forbid it invites a model to reach for it, and the value would be refused downstream anyway.
- A line the parser cannot read is skipped rather than failing the batch, and an entry with no quote is dropped — the same view `applyAgentEntries` takes of a value the registry refuses.
- **Never overwrites what a person typed**, whatever the policy says. That change is always a proposal (§3.2).
- Writes through one internal mutation per batch, not per entry: two entries from the same message must not race each other into the same document.

**C. `voice_profile`** (background, batched) — ***built*** *(`matchmakerProfiles/actions.ts`), on the write path §3 already had.*
- Input: what they wrote in settings, then their own sent messages (§9.2 sets how many).
- Output: a prose voice profile — register, warmth, sentence length, greeting and sign-off habits, characteristic phrases, things they never say — plus what the product has learned about them.
- Runs after every N sent messages (`AI_VOICE_SAMPLE_MESSAGES`, 20), never per message — the count is kept on the matchmaker's profile, because "how many messages has this matchmaker ever sent" has no index that answers it cheaply and would only get dearer as their book grows. The mark moves when a run is scheduled rather than when it finishes, so two messages either side of the threshold cannot buy two generations over one sample.
- **Reads twice the cadence**, so a run sees the window it was woken for and the one before it: a voice distilled from only the newest twenty messages would swing with whatever kind of week they have just had. Only messages they typed — an imported history is partly the candidate's words, and a voice built partly from the person being written to is worse than no voice.
- **No thread.** The other two keep one because a conversation is continuous; this one runs rarely over a window it reads fresh, and a thread would be a second copy of a matchmaker's writing in tables `ctx.db` cannot see, kept for no gain. The run creates one, uses it and deletes it.
- This is the only read in the product that crosses conversations, and it crosses them inside one tenant: `matchmakerId` leads the index, so there is no ordering of it that reaches another matchmaker's book.

### 4.2 Context assembly

Facts are never appended into message history. They're read live at prompt time:

```
[system prompt: role, guardrails, output format]
[matchmaker voice profile]
[candidate profile: the filled entries, grouped by the registry, as a compact list]
[last N messages verbatim]
```

A newly written entry is reflected in the very next generation. An open proposal is **not** part of the context: nobody has agreed to it.

**Guardrails:** candidate messages are untrusted input — instructions inside them are content, not commands. Suggested replies must not reveal facts the candidate hasn't stated in this conversation, or the matchmaker's notes.

### 4.3 Evaluation

Semantic deduplication is the hard sub-problem: "likes hiking" and "enjoys the outdoors" should merge; "likes hiking" and "hates the gym" should not. Build 40–60 (existing facts, candidate fact) pairs with known correct actions and run them against the reconciliation prompt on every prompt change. Build the set from **synthetic or consented** conversations, never raw candidate data.

---

### 4.4 Model and prompt settings

Each agent's **switch, model and standing instruction live in the database** (`aiAgentSettings`) and are edited by a platform admin at **`/admin/ai`**.

- **The database is the only source.** Nothing in the code supplies a model or a prompt — `convex/ai/rules.ts` holds validation and labels and no prose at all, and `ai/helpers.ts` substitutes nothing. An agent nobody has configured is **off**, rather than quietly running on a value a reader would have to go looking for.
- **Four ways to be off, and the page says which:** never set up, switched off, no model, no instruction. `activeAgent()` is the single question a feature asks — it returns the settings or `null`, so no caller has to remember four conditions. `AI_ENABLED` is a fifth, separate thing: whether this deployment can reach the gateway at all.
- **Empty means off.** Clearing the model or the instruction turns an agent off, so there is no magic value to remember and no way to have a model without an instruction.
- **The starting values are seed data** (`convex/seed/ai/fixture.ts`, applied by `seed/ai/mutations:apply` via `ai:setup`), not defaults. Seeding is idempotent and never overwrites an admin's work; `--force` puts an agent back to where it started. Unlike `seed/dev` and `seed/e2e` this seed wipes nothing and is safe against prod — it is how a production deployment gets its agents at all.
- **The guardrails are part of each seeded instruction, not prepended in code**, so everything an agent is told is visible and editable on one page. The cost is that an admin can edit them away; the page therefore says to carry them over, and a test asserts the seeded instructions contain both. *If that trade turns out wrong, moving them back into code is a small change — but it makes the page no longer the whole truth.*
- **The stored instruction is the agent's standing instruction, not its task.** The conversation agent drafts and extracts; one prompt describing both would serve neither. The instruction is the persona and the rules that hold on every call; the task for a given call is added by the code that makes it.
- **Every change is audited as `ai_agent.updated`, with the whole previous instruction in the event.** That is deliberately where an instruction's history lives: the audit trail is already append-only and already refuses to be rewritten, so a separate versions table would be a second, less trustworthy copy. To read an old instruction, read the trail. A platform-level event carries no `matchmakerId`, so it appears in the admin trail and in no matchmaker's candidate history — right, because it is our change to the product, not a change to their book.
- **A save that changes nothing records nothing.** An event per no-op save makes the trail harder to read, not more complete.
- **There is no "reset to default" button**, because there is no default to reset to. Re-seeding is a deliberate operation with a flag, run from a terminal.

### 4.5 What is installed (built)

The plumbing is in, with no product feature on top of it yet:

- **`convex/ai/`** — `rules.ts` (agent ids, labels, validation, and *no* defaults or prose), `helpers.ts` (`activeAgent`, the one question a feature asks), `queries.ts` (internal reads), `actions.ts` (the only place a call leaves Convex). Plus `convex/seed/ai/` for the starting values and `/admin/ai` to own them after that.
- **No API key anywhere.** `convexGateway` from `@convex-dev/ai-sdk-provider` mints a short-lived deployment token per action; the **Convex AI gateway** holds the provider credentials. This changes §7 and §9.1: there is no separate provider contract to sign, and Convex is the sub-processor the DPA names.
- **Three agents (§4.1), each proven against the dev deployment** with its own model *and its real stored instruction*, so an instruction the gateway would reject is caught by `ai:setup` rather than by a candidate's first message. Seeded model: `openai/gpt-5.6-luna` for all three. (The probe asks for one word and an agent usually answers in its own terms instead — it is following its instruction, which is the thing being checked.)
- **`AI_ENABLED`, because off is a supported state.** The gateway needs a paid Convex Cloud deployment, so a local backend and the e2e suite's anonymous one cannot reach it. `pnpm --filter @repo/api ai:setup` sets the flag, seeds any agent that has never been set up, and then calls each agent's model — a flag reading "on" while the gateway refuses us is the one state worse than off.
- **`ai/actions.ts:probe`** — one generation with nothing of the product in it: no candidate, no conversation, no thread. It answers the only question a unit test cannot, which is whether this deployment can reach the model an agent is configured with.
- **No `"use node"`, anywhere in `convex/`.** The provider's README uses it and it is not needed — the gateway is reached over `fetch`, which Convex's own runtime has. It is also not *allowed*: a local anonymous backend cannot run Node actions, so a single `"use node"` file fails the **whole** push with `DeploymentNotConfiguredForNodeActions` and every e2e spec then runs against stale functions. Recorded in `CLAUDE.md` §8, because it binds the whole backend and not just this domain.
- ~~**The `agent` component is registered and unused.**~~ It is used: §4A creates one thread per conversation. The condition above went with it, and did not travel — see the note in §4.

## 5. UI additions

- **Conversation (partly built):** a stack of suggestion cards **above the composer**, between the thread and the input — one row per kind, at most one card per row, the four kinds named and ordered in `apps/app/src/chat/suggestions.ts`. A drafted reply sits nearest the box being typed in. *Built:* the drafted reply, with **Send**, **Edit** and **Dismiss**; the per-conversation switch in the header; and the proposal cards for both profiles, which needed no new UI at all — §4B and §4C write through the same doors the Profile section and the settings page already read, so the stack that had been rendering nothing outside the dev seed started rendering real proposals the day the agents landed. *Not built:* system notes with Undo. All of it is private to the matchmaker. A match suggestion was once listed here and is not: a match is about two people and the composer is addressed to one, so it lives in the candidate panel (prd/phase-3.md §2).
- **Candidate panel (built):** a **Profile** section, second after Details. It renders **what is filled in, not the whole registry** — forty-odd empty rows would bury the four that say something — grouped by the registry, each with its source and its verbatim quote, and an inline editor whose control comes from the field's value kind. Suggestions sit above the record, visually apart, because a proposal nobody has answered is not part of it. **Details stays open by default:** it holds membership state and the invite controls, which is what a matchmaker needs on opening a thread they haven't touched in a week.
- **History tab (built):** profile and agent entries, the agent's actor line naming the model it ran on. New filter: **Profile**, which also covers the `note.*` events the old table left behind.
- **Matchmaker settings (built):** their voice, with the agent's draft above the box rather than in it.
- **`/admin/ai` (built):** the three agents, each with a switch, the model it runs on and its standing instruction, and a line saying which of the four ways it is off when it isn't running. Says plainly when the deployment can't reach a model at all, rather than implying the settings are already doing something.
- **`/admin/usage` (built):** what the agents have spent, over 1, 7 or 30 UTC days — totals, then by agent, by model, by matchmaker and by day — and the rate each model is priced at. **Tokens and money are kept apart on it**: the gateway reports a token count and no price, so every figure in dollars is arithmetic over a rate typed on that page, an unpriced model shows no cost rather than a zero, and a total says how many generations it is missing. It is what §9.2's per-matchmaker budget has to be chosen from.

The welcome suggestion on acceptance (§2, §4A) is triggered from `convex/invites/`, which owns accepting an invitation (prd/phase-1.md §7).

## 6. Non-functional requirements

- **Suggested-reply latency — the requirement changed with the feature.** "First token under ~2 s, through `persistent-text-streaming`" was written for a draft that appeared *while the matchmaker waited for it*. What shipped does not make them wait: drafting is triggered by the candidate's message and lands seconds later, above a composer they are free to type in meanwhile, so there is no first token to be under 2 s of. The run therefore makes one `generateText` call and writes all of its drafts in one mutation — three drafts from one call have to arrive together, or a matchmaker sees one card, then two more, and wonders which came first. **What holds instead:** a run must never delay a message being sent, and must fail silently. Streaming comes back if a draft is ever generated on demand.
- **Cost control:** keep the reply suggester's context tight; background jobs use a cheaper model; `rate-limiter` caps AI calls per matchmaker. **Measured, as of `/admin/usage` (§5):** every call records its tokens in `aiGenerations`, priced against the rates in `aiModelRates` at the moment it ran. None of the three controls above is built; what is built is the ability to say what they would save.
- **Audit:** every auto-applied fact is undoable and shows provenance.
- **Switches, models and prompts are database settings** edited at `/admin/ai` (§4.4), with no code-level default behind them. **Every remaining number is a deployment setting**, declared in `convex.config.ts` beside phase 1's: the auto-apply threshold, the suggested-reply count, the debounce window, the voice-sample minimum, the live-window size and the per-matchmaker budget. Phase 1 did this for its two notification delays once prd/phase-1.md §12 admitted they were guesses that only a real matchmaker could correct (`NOTIFICATION_PUSH_DELAY_SECONDS`, `NOTIFICATION_EMAIL_DELAY_SECONDS`). Every number in §9.2 is the same kind of guess, and tuning one should not need a deploy.

## 7. Privacy

- **Model calls go through the Convex AI gateway** (§4.3), which holds the provider credentials. There is no API key in this deployment and no provider contract of our own, so **Convex is the sub-processor** the DPA in [#1](https://github.com/cloudexible-org/match.build/issues/1) names — the same one it already names for the database. What remains is to confirm the gateway's own training and retention terms, and what it says about the providers behind it, rather than to negotiate with a provider ourselves.
- **Profiles are the matchmaker's records**, collected and maintained by them with the AI's help, like their notes. The matchmaker is the controller (prd/phase-1.md §9.3); an erasure anonymises the identifying and special-category facts and leaves the rest standing (§3.1).
- **`candidateProfiles` is keyed to a candidate.** What the product learns about the *matchmaker* lands in `matchmakerProfiles` instead, which is a different table with a different owner and no candidate in it.
- **Candidates never see their profile.** That is a UI decision and not a legal one: facts are personal data about the candidate, so an access request reaches them whether or not a screen does. Whether *showing* them would improve the data enough to be worth it is still open (§9.3); whether they must be *disclosable* is not, and is part of [#3](https://github.com/cloudexible-org/match.build/issues/3).
- **Candidate messages are untrusted input** (§4.1). Instructions inside them are content, never commands.

## 8. Build order

**Where it lands.** Two new domains and a shared kernel (§3.5). Everything else extends a domain phase 1 already built: reply suggestions get a domain of their own (`replySuggestions/`), the welcome trigger in `invites/`, the agent actor and the new actions in `audit/`, and the profile branch of the erasure in `admin/`.

0. *Done.* **AI plumbing** (§4.5) and **the settings page** (§4.4): the `agent` component, the gateway, `convex/ai/`, the three agents seeded from `convex/seed/ai/`, `/admin/ai`, and `ai:setup`. No product feature on it yet.
1. *Done.* **Profiles** (§3): the two tables, the registry, the write engine with its per-field policy, the three write paths, the Profile section, voice in settings, audit integration, the erasure branch, and the migration off `notes`. **No agent calls the write path yet** — the door is built, nobody has come through it.
2. *Done.* **Reply suggester** (§4A): the debounce and its sliding window, staleness on both sides of the thread, the drafts and the answers to them, the per-conversation switch, the agent thread that gets briefed once and updated after that, and the voice read into every run. **Not streamed** — see §6 for why the latency requirement that asked for streaming no longer describes the feature. *Left over from this step:* the welcome draft on acceptance, in `invites/`.
3. *Done.* **Extractor** feeding `candidateProfiles.mutations:applyAgentEntries`, and **the voice-profile agent** feeding `matchmakerProfiles.mutations:applyAgentVoice` (§4.1B, §4.1C). Both doors were built, tested and unused; agents now come through them, and the UI needed no change to show what arrives. **`eraseAccount` was wired into the `agent` component first**, as §4 required, and a test proves it.
4. **Next.** Extraction from the imported history at onboarding. It is a second thing scheduling a profile run, which is where §4's `workpool` row stops being theoretical.
5. Eval harness.
*Also done:* the migration off `notes` and the removal of the table (§3).

---

## 9. Open questions

The first draft listed eleven of these flat, which made a number that wants a week with a real matchmaker look like a blocker, and made two genuine blockers look like preferences. They sort into three kinds.

### 9.1 Must be settled before any code

- ~~**LLM provider and models.**~~ *Resolved by building it (§4.3).* Calls go through the Convex AI gateway, so there is no provider to choose, no key to hold and no second contract: Convex is the sub-processor. **The models are not named here and should not be**, because they are not a decision this document holds: each agent's model is a database setting edited at `/admin/ai` (§4.4), starting from whatever `convex/seed/ai/fixture.ts` seeds — today `openai/gpt-5.6-luna` for all three. A model named in a PRD is a model that goes stale the first time somebody changes the one that runs. **What is left is a question for [#1](https://github.com/cloudexible-org/match.build/issues/1), not for this phase:** confirm the gateway's training and retention terms and what they say about the providers behind it. Still do that before the DPA is drafted — amending a signed DPA means going back to every matchmaker who signed it — but it is now a paragraph to verify rather than a vendor to pick.
- **Prompt injection and leakage — open, and now overdue.** Not "is a system-prompt guardrail enough" — that framing invites a yes. Special-category data, plus an LLM drafting messages a human sends under their own name, is the one place in this product where a leak harms a real person. It needs a mechanism: what checks a suggestion before it can reach the Send button, and what a failed check does. **This section is headed "must be settled before any code", and §4A shipped without it.** What stands in its place today is weaker and should be named honestly: the seeded instruction tells the agent that candidate messages are content and never commands, a draft is never sent without a human pressing Send, and a run only ever sees one candidate's data. That is a guardrail and a human in the loop — it is not the check this bullet asks for, and it is not a reason to relax the bullet. Settle it before the extractor (step 3) starts writing what a message told it to.
- ~~**Key registry contents**~~ *Resolved by building it (§3.4).* The registry is ~48 fields in `convex/candidateProfiles/rules.ts`; adding a key is an edit to that file and renaming one is still a migration, which is the part that has not changed.
- **Eval data.** Where realistic but synthetic or consented conversations come from (§4.2). The reconciler cannot be built honestly without them, and it must never be raw candidate data. Still open, and step 3 is the step that needs it: an extractor with no evals is a feature whose accuracy nobody can state.

### 9.2 Ship as a setting, tune with the pilot

None of these blocks a line of code: each ships as a deployment env var with the value below as its default, exactly as phase 1's notification delays did (§6). Three of them shipped with §4A and are waiting for a matchmaker to correct them; the **State** column says which. (Models and prompts are *not* in this table — they are database settings on a page, §4.4.)

| Setting | Starting value | State | Why it's a guess |
|---|---|---|---|
| ~~Auto-apply threshold~~ | — | Gone | *Resolved by building it (§3.2):* whether a change is applied or proposed is a property of the **field**, not of a number the model produces. A model's confidence is not calibrated across fields, and a threshold would have let a bad 0.9 on `orientation` through while blocking a good 0.7 on `pets`. `confidence` is still stored, as something to show and to tune against later. |
| Suggested replies shown | 3 | Shipped — `AI_REPLY_COUNT` | Three may be choice paralysis on a phone. |
| Debounce window | ~5 s | Shipped — `AI_REPLY_DEBOUNCE_SECONDS` | Depends how people actually type in bursts. |
| Voice samples required | 20 sent messages | Shipped — `AI_VOICE_SAMPLE_MESSAGES` | Unknown whether fewer already stops sounding generic. A run reads twice this number and fires every this-many (§4.1C). |
| Live window | 50 messages | Shipped — `AI_REPLY_LIVE_WINDOW` | With no summariser, this is the whole of what the agent sees. Too low and a long thread loses its thread; too high and every call pays for context nobody reads. |
| Per-matchmaker AI budget | — | **Not built. Now measurable** — `/admin/usage` | Both the limit *and* what happens when it's hit: degrade to no suggestions, or tell them? Not a number waiting for a pilot. A message costs up to two generations rather than one — a draft and a reconciliation — plus a third every twentieth message the matchmaker sends. This is still the only thing between a busy book and a bill nobody chose. What changed is that the bill is now visible per matchmaker and per agent rather than guessed at (§5, §6): the row stays open because a number you can read is not a limit you have chosen, but it is no longer a number nobody has. |

### 9.3 Open product question

- **Profile visibility to candidates.** Currently none. Would letting a candidate review and correct their own profile improve the data enough to be worth it? This is the only item here that changes the product's shape rather than a number, and it is a product question only — the legal half is settled (§7) and swept in [#3](https://github.com/cloudexible-org/match.build/issues/3). The write engine is ready for the answer to be yes: a candidate would be a third `ProfileWriter` and a policy the registry grows (§3.5).

*Closed by §3.2:* whether the AI may ever change a value a person typed. It may propose, never overwrite.
