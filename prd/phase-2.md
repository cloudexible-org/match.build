# Phase 2 — AI assistance

**Status:** Partly built. §3 (profiles) and §4.4 (the agent settings page) are shipped and marked as such; everything else is proposed, not agreed. §9 sorts what's left into what must be settled before any code, what ships as a setting and gets tuned with the pilot, and what is still an open product question.
**Depends on:** [phase-1.md](phase-1.md) shipped *and used by a real matchmaker* — which is gated on the terms in [#1](https://github.com/cloudexible-org/match.build/issues/1), not on engineering. The AI plumbing itself is built (§4.3); §9.1 is what is left before a feature sits on top of it.
**Data protection:** everything this phase adds is swept in [#3](https://github.com/cloudexible-org/match.build/issues/3) before v1 ships. A profile is the matchmaker's own record, like their notes were (§7).
**Goal:** make the matchmaker faster and sharper inside the conversation they already run in the app: suggested replies in their voice, and a candidate profile that builds itself from the conversation.

**Principle:** AI is never blocking. If any of this fails, phase 1 still works exactly as before.

---

## 1. Scope

1. **Reply suggestions** in the conversation, in the matchmaker's voice.
2. **Candidate profiles (§3, built):** a structured record per candidate — registry-typed facts and free-text notes — with a per-field rule about who may write it, provenance on every value, and an agent's proposal sitting beside a value rather than replacing it. What is left is the extraction that feeds it.
3. **Profile section (built)** in the candidate panel: filled fields grouped by the registry, their source and quote, manual add/edit/clear, and suggestions above the record.
4. **Voice (§3, built)** in matchmaker settings, one `suggest` field the voice-profile agent may draft but never change under them.
5. **Thread summaries** for long conversations.
6. **Eval harness** for reconciliation.

Every profile change and voice change is written to the phase-1 audit trail, with the agent as the actor where it made the change.

---

## 2. Conversation experience (proposed)

- On each candidate message (debounced, §4A), the reply suggester produces 1–3 suggested replies, rendered inline as a visually distinct card (never styled like a real message), each with **Send**, **Edit**, **Dismiss**. A matchmaker must never mistake an AI suggestion for something the candidate said.
- When a candidate accepts an invitation, a suggested welcome message appears.
- Fact extraction runs in the background. What the agent may write it writes, and what it may only propose lands in the Profile section as a suggestion (§3.2); the field's policy decides, not the model's confidence.
- The composer always works without AI.

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
  summary: v.optional(v.string()),
  summarisedThroughSeq: v.optional(v.number()),
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

## 4. Agents and jobs (proposed)

They communicate **through the database**, never by sharing context. Phase 3's match and reminder agents reuse the same mechanism.

**Components, not hand-rolled plumbing.** Three of the four things this phase needs around an LLM call already exist as Convex components, and phase 1 hand-rolled nothing it didn't have to:

| Component | What it does here |
|---|---|
| `@convex-dev/workpool` | Every background job below. Gives §4B its "one job per candidate at a time" as configuration rather than as a lock invented in a profile row. |
| `@convex-dev/persistent-text-streaming` | §4A's streamed replies. A mutation per token is a database write per token, which is what "streamed into a `replySuggestions` row" would otherwise mean. |
| `@convex-dev/rate-limiter` | §6's per-matchmaker AI budget. |
| `@convex-dev/agent` | Threads, message history, tool calls and usage tracking for the AI side. **Installed** (§4.3). |

**`@convex-dev/agent`, on one condition.** An earlier draft of this section ruled it out, on the grounds that it brings its own threads and messages tables while the product already has `conversations` and `messages` that are tenanted, audited, read-markered, notification-driving and erasure-aware. The first half of that is true and the conclusion was wrong: the component's thread is the *model's* record of a conversation, not the product's, and the two can coexist as long as one of them is unambiguously the source of truth.

So: **`conversations` and `messages` stay the product's source of truth.** Nothing the UI renders, nothing a notification fires from, and nothing a matchmaker keeps comes out of a component table. An agent thread is the context the model is given, downstream of the real thread and rebuildable from it.

The condition is the one that made the earlier draft nervous, and it is concrete rather than a matter of taste: **a component's tables are invisible to `ctx.db`**, so `admin.mutations.eraseAccount` cannot walk them the way it walks `candidates` and `auditEvents`. The component has its own door — `components.agent.users.deleteAllForUserId` — and an erasure has to knock on it. Nothing creates a thread until that is wired; see [#3](https://github.com/cloudexible-org/match.build/issues/3).

`@convex-dev/rag` is worth a look in phase 3 for cross-conversation retrieval, not here.

### 4.1 Three agents, and what each one owns

An earlier draft listed five jobs (A reply suggester, B fact extractor, C fact reconciler, D voice-profile job, E summariser). They collapse into **three agents**, which is the better cut: it separates *reading* a conversation and proposing from *owning the write path* to a record. The five-job split had two agents on the read side and left the write path as a step rather than an owner.

| Agent | Owns | Absorbed |
|---|---|---|
| `conversation` | Reading one thread: drafting a reply, noticing facts, keeping the summary. Proposes; writes nothing to a record. | A + B + E |
| `candidate_profile` | The write path to a candidate's facts. | C |
| `voice_profile` | The write path to the matchmaker's voice profile — and to everything the product learns about the matchmaker. | D |

**The summariser is not its own agent.** It reads the same thread to write another derived artefact, on a different trigger (thread length rather than a new message). One agent, three outputs.

**What the product learns about the *matchmaker* lands in their voice.** `candidateProfiles` stays keyed to a candidate, and `matchmakerProfiles` is where the other half goes. So `voice` is wider than its name suggests: not only how they write, but how they work and what they care about in a match. Take this paragraph as its definition, and `convex/matchmakerProfiles/rules.ts` as where it is written down.

**Each agent has one model and one standing instruction, platform-wide, stored in the database and edited at `/admin/ai`** (§4.4). A matchmaker's own character does not vary the prompt — it is the voice profile, which is *data a prompt reads*.

**A. `conversation`** (foreground for the draft, background for the rest)
- Trigger: a candidate message, **debounced** (~5 s after the last one, so a burst produces one generation). Also once when a candidate accepts, for a welcome message — triggered from `convex/invites/`, which owns accepting.
- Input: the standing prompt + voice profile + active facts for this candidate + conversation summary + last N messages (including the private imported history).
- Output: 1–3 replies streamed through `persistent-text-streaming`; candidate facts, each with a verbatim source quote; and the rolling summary.
- Live window: last **20** messages verbatim. Older messages roll into `conversations.summary` when the thread crosses a threshold, tracked by `summarisedThroughSeq` so it is incremental. The summary is for conversational continuity — rapport, tone, key events, sensitivities — not fact retention.
- Earlier `ready` suggestions become `stale` when a new message arrives or the matchmaker replies manually.
- Never receives another candidate's data.

**B. `candidate_profile`** (background) — *the write path is built (§3); what feeds it is not.*
- Runs once per message over all the facts the conversation agent noticed, serialised per candidate — a `workpool` with a per-candidate key, one job at a time. Parallel per-fact jobs would race: two facts from one message could both add a duplicate or both supersede the same fact.
- Input: those candidate facts + the source message + the candidate's current profile, including any open proposals, so it does not keep asking the same question.
- Output per entry: a registry key and a value, or a removal. It does **not** say whether to write or to suggest — `candidateProfiles.mutations:applyAgentEntries` decides that from the field's policy, and an agent that could choose would make the policy advisory.
- **Never overwrites what a person typed**, whatever the policy says. That change is always a proposal (§3.2).
- Writes through one internal mutation per batch, not per entry: two entries from the same message must not race each other into the same document.

**C. `voice_profile`** (background, batched) — *the write path is built (§3); what feeds it is not.*
- Input: what they wrote in settings, then their own sent messages (§9.2 sets how many).
- Output: a prose voice profile — register, warmth, sentence length, greeting and sign-off habits, characteristic phrases, things they never say — plus what the product has learned about them.
- Runs on a schedule or after every N sent messages, never per message.

### 4.2 Context assembly

Facts are never appended into message history. They're read live at prompt time:

```
[system prompt: role, guardrails, output format]
[matchmaker voice profile]
[candidate profile: the filled entries, grouped by the registry, as a compact list]
[conversation summary: if the thread exceeds the live window]
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
- **The stored instruction is the agent's standing instruction, not its task.** The conversation agent drafts, extracts and summarises; one prompt describing all three would serve none of them. The instruction is the persona and the rules that hold on every call; the task for a given call is added by the code that makes it.
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
- **The `agent` component is registered and unused.** No thread is created anywhere yet, by the condition above.

## 5. UI additions

- **Conversation:** reply-suggestion cards, fact-suggestion cards, system notes with Undo (all private to the matchmaker).
- **Candidate panel (built):** a **Profile** section, second after Details. It renders **what is filled in, not the whole registry** — forty-odd empty rows would bury the four that say something — grouped by the registry, each with its source and its verbatim quote, and an inline editor whose control comes from the field's value kind. Suggestions sit above the record, visually apart, because a proposal nobody has answered is not part of it. **Details stays open by default:** it holds membership state and the invite controls, which is what a matchmaker needs on opening a thread they haven't touched in a week.
- **History tab (built):** profile and agent entries, the agent's actor line naming the model it ran on. New filter: **Profile**, which also covers the `note.*` events the old table left behind.
- **Matchmaker settings (built):** their voice, with the agent's draft above the box rather than in it.
- **`/admin/ai` (built):** the three agents, each with a switch, the model it runs on and its standing instruction, and a line saying which of the four ways it is off when it isn't running. Says plainly when the deployment can't reach a model at all, rather than implying the settings are already doing something.

The welcome suggestion on acceptance (§2, §4A) is triggered from `convex/invites/`, which owns accepting an invitation (prd/phase-1.md §7).

## 6. Non-functional requirements

- **Suggested-reply latency:** first token under ~2 s, through `persistent-text-streaming` (§4). On failure, fail silently.
- **Cost control:** keep the reply suggester's context tight; background jobs use a cheaper model; `rate-limiter` caps AI calls per matchmaker.
- **Audit:** every auto-applied fact is undoable and shows provenance.
- **Switches, models and prompts are database settings** edited at `/admin/ai` (§4.4), with no code-level default behind them. **Every remaining number is a deployment setting**, declared in `convex.config.ts` beside phase 1's: the auto-apply threshold, the suggested-reply count, the debounce window, the voice-sample minimum, the live-window size and the per-matchmaker budget. Phase 1 did this for its two notification delays once prd/phase-1.md §12 admitted they were guesses that only a real matchmaker could correct (`NOTIFICATION_PUSH_DELAY_SECONDS`, `NOTIFICATION_EMAIL_DELAY_SECONDS`). Every number in §9.2 is the same kind of guess, and tuning one should not need a deploy.

## 7. Privacy

- **Model calls go through the Convex AI gateway** (§4.3), which holds the provider credentials. There is no API key in this deployment and no provider contract of our own, so **Convex is the sub-processor** the DPA in [#1](https://github.com/cloudexible-org/match.build/issues/1) names — the same one it already names for the database. What remains is to confirm the gateway's own training and retention terms, and what it says about the providers behind it, rather than to negotiate with a provider ourselves.
- **Profiles are the matchmaker's records**, collected and maintained by them with the AI's help, like their notes. The matchmaker is the controller (prd/phase-1.md §9.3); an erasure anonymises the identifying and special-category facts and leaves the rest standing (§3.1).
- **`candidateProfiles` is keyed to a candidate.** What the product learns about the *matchmaker* lands in `matchmakerProfiles` instead, which is a different table with a different owner and no candidate in it.
- **Candidates never see their profile.** That is a UI decision and not a legal one: facts are personal data about the candidate, so an access request reaches them whether or not a screen does. Whether *showing* them would improve the data enough to be worth it is still open (§9.3); whether they must be *disclosable* is not, and is part of [#3](https://github.com/cloudexible-org/match.build/issues/3).
- **Candidate messages are untrusted input** (§4.1). Instructions inside them are content, never commands.

## 8. Build order

**Where it lands.** Two new domains and a shared kernel (§3.5). Everything else extends a domain phase 1 already built: reply suggestions and the summariser go in `messages/`, the welcome trigger in `invites/`, the agent actor and the new actions in `audit/`, and the profile branch of the erasure in `admin/`.

0. *Done.* **AI plumbing** (§4.5) and **the settings page** (§4.4): the `agent` component, the gateway, `convex/ai/`, the three agents seeded from `convex/seed/ai/`, `/admin/ai`, and `ai:setup`. No product feature on it yet.
1. *Done.* **Profiles** (§3): the two tables, the registry, the write engine with its per-field policy, the three write paths, the Profile section, voice in settings, audit integration, the erasure branch, and the migration off `notes`. **No agent calls the write path yet** — the door is built, nobody has come through it.
2. Reply suggester (streaming, debounce, stale handling), reading the voice.
3. Extractor feeding `candidateProfiles.mutations:applyAgentEntries`, and the voice-profile agent feeding `matchmakerProfiles.mutations:applyAgentVoice`.
4. Extraction from the imported history at onboarding.
5. Summariser.
6. Eval harness.
*Also done:* the migration off `notes` and the removal of the table (§3).

---

## 9. Open questions

The first draft listed eleven of these flat, which made a number that wants a week with a real matchmaker look like a blocker, and made two genuine blockers look like preferences. They sort into three kinds.

### 9.1 Must be settled before any code

- ~~**LLM provider and models.**~~ *Resolved by building it (§4.3).* Calls go through the Convex AI gateway, so there is no provider to choose, no key to hold and no second contract: Convex is the sub-processor, and the models are `anthropic/claude-opus-5` for drafting and `anthropic/claude-haiku-4-5` for extraction, both overridable per deployment. **What is left is a question for [#1](https://github.com/cloudexible-org/match.build/issues/1), not for this phase:** confirm the gateway's training and retention terms and what they say about the providers behind it. Still do that before the DPA is drafted — amending a signed DPA means going back to every matchmaker who signed it — but it is now a paragraph to verify rather than a vendor to pick.
- **Prompt injection and leakage.** Not "is a system-prompt guardrail enough" — that framing invites a yes. Special-category data, plus an LLM drafting messages a human sends under their own name, is the one place in this product where a leak harms a real person. It needs a mechanism: what checks a suggestion before it can reach the Send button, and what a failed check does.
- ~~**Key registry contents**~~ *Resolved by building it (§3.4).* The registry is ~48 fields in `convex/candidateProfiles/rules.ts`; adding a key is an edit to that file and renaming one is still a migration, which is the part that has not changed.
- **Eval data.** Where realistic but synthetic or consented conversations come from (§4.2). The reconciler cannot be built honestly without them, and it must never be raw candidate data.

### 9.2 Ship as a setting, tune with the pilot

None of these blocks a line of code: each ships as a deployment env var with the value below as its default, exactly as phase 1's notification delays did (§6). (Models and prompts are *not* in this table — they are database settings on a page, §4.4.)

| Setting | Starting value | Why it's a guess |
|---|---|---|
| ~~Auto-apply threshold~~ | — | *Resolved by building it (§3.2):* whether a change is applied or proposed is a property of the **field**, not of a number the model produces. A model's confidence is not calibrated across fields, and a threshold would have let a bad 0.9 on `orientation` through while blocking a good 0.7 on `pets`. `confidence` is still stored, as something to show and to tune against later. |
| Suggested replies shown | 3 | Three may be choice paralysis on a phone. |
| Debounce window | ~5 s | Depends how people actually type in bursts. |
| Voice samples required | 20 sent messages | Unknown whether fewer already stops sounding generic. |
| Live window | 20 messages | Trades summariser cost against continuity. |
| Per-matchmaker AI budget | — | Both the limit *and* what happens when it's hit: degrade to no suggestions, or tell them? |

### 9.3 Open product question

- **Profile visibility to candidates.** Currently none. Would letting a candidate review and correct their own profile improve the data enough to be worth it? This is the only item here that changes the product's shape rather than a number, and it is a product question only — the legal half is settled (§7) and swept in [#3](https://github.com/cloudexible-org/match.build/issues/3). The write engine is ready for the answer to be yes: a candidate would be a third `ProfileWriter` and a policy the registry grows (§3.5).

*Closed by §3.2:* whether the AI may ever change a value a person typed. It may propose, never overwrite.
