# Analytics events — draft taxonomy

**Status: a draft to argue with, partly implemented.** Tier 1 — SPA
pageviews, URL masking and identity — shipped; see `packages/analytics` and
`apps/app/src/analytics/`. The **A** events below ship too, from the server:
`convex/analytics/` forwards audited changes, and its `RULES` table is the
authority on which actions are sent and with what. The **S** and **C** events
are still proposals, as is every property marked *derived* in §5.

What the shipped **A** half does differently from the tables below:

- **Invites keep their audit names.** `invite.created`, `invite.sent`,
  `invite.resent` and `membership.reinvited` are sent as themselves rather than
  as one `invite.sent` with a `trigger` — the names already say which.
- **Only properties readable from the audit event are sent:** actor, and
  `from`/`to`, `outcome`, `closed_by`, `kind`, `has_note`, `has_reason`. The
  ones that need a lookup or a clock (*derived*: `hours_to_accept`,
  `days_joined`, `fields_filled`, `has_social`, `score_bucket`, `origin`,
  `had_matchmaker`, `was_first`, `archive_both`) are not yet.
- **Profile events are one per entry**, so `profile.suggested` counts entries
  offered, like accepted and rejected do.

Every event below is marked **core** or **later**. Cutting all the `later` rows
leaves 12 events, which is enough to answer §6.

---

## 1. The event names already exist

The audit trail has been building a vocabulary of "something happened" for
phases 1 and 2, and it is a good one:

```
account.created            invite.sent                match.created
account.deleted            invite.accepted            match.stage_changed
account.name_changed       invite.declined            match.closed
candidate.created          invite.revoked             match.suggested
candidate.status_changed   invite.email_changed       profile.suggested
matchmaker.created         membership.left            profile.suggestion_accepted
```

**Analytics should reuse these names, not invent a parallel set.** Two
vocabularies for the same facts is how "how many invites went out" comes to have
two different answers depending on who you ask.

It goes further than naming. Every audited change already flows through one
function — `recordAudit` (`convex/audit/helpers.ts`) — called in the same
mutation as the change it describes, carrying `action`, `actor`,
`matchmakerId`, `candidateId` and the entity. So the server-side half of this
is **one integration point, not thirty call sites**: an emitter beside
`recordAudit` that schedules an internal action per event.

That matters for more than effort. `actor` distinguishes a person from an
agent from a cron, and phase 2's whole argument is that the agents do more of
the work over time. Instrument only the browser and every agent-driven
`profile.updated` is invisible — the funnel would appear to *decay* exactly as
the product started working.

> **One guardrail.** `recordAudit`'s `changes` and `reason` carry personal
> values — they are what an erasure redacts (#3). The emitter must send the
> action, the actor *type* and non-personal dimensions only, and never the
> `changes` array. Easy to get right once, impossible to notice once wrong.

### What this splits the work into

| | Source | Cost |
|---|---|---|
| **A — audited facts** | one emitter beside `recordAudit` | ~1 day, covers ~15 events |
| **C — client call sites** | a typed `capture()` per site | ~1–2 days, ~10 events |
| **S — server, unaudited** | explicit call in the mutation/action | folded into A |

Each event below is tagged **A**, **C** or **S**. An event is never both:
one owner per fact, or it is double-counted.

---

## 2. Naming

- `object.verb_past`, snake_case within a part — as the audit trail already does.
- The object is the thing that changed, not the person who changed it. `actor`
  is a property, not part of the name.
- No `_clicked` events. A click that fails to do the thing is not the fact worth
  counting; autocapture already records the click itself.

## 3. What never goes in a property

Hard blocklist, enforced in the typed wrapper rather than left to discipline:

- **No free text.** No message bodies, notes, closing notes, leave reasons,
  `sourceQuote`, usernames typed into a form.
- **No identifiers of people** — no email, name, Instagram handle, no
  `candidateId`, no `userId` beyond the distinct id already set by `identify()`.
- **No invite tokens**, in any property, ever.
- **Counts, buckets, enums and booleans only.** `note_length` as a bucket
  (`none` / `short` / `long`), never the note.

The one identifier that does travel is the **matchmaker username**, as the group
key — it is their public handle and is already in the URL. Flagged on #3.

## 4. Person and group properties

**Person** (`identify`) — set today: the opaque `users` id, nothing else.
Deliberately no name or email (§3, and #3).

Worth adding, all derivable and none personal:

| Property | Why | |
|---|---|---|
| `role` | `matchmaker` / `candidate` / `both` — almost every question below splits on it | core |
| `matchmaker_count` | distinguishes a real matchmaker from someone who made a profile and stopped | later |
| `joined_matchmakers` | same, for the candidate side | later |

**Group** (`group("matchmaker", username)`) — set today. Worth adding:
`candidate_count`, `book_size_bucket`, `ai_enabled`. All **later**: they only
pay off once there is more than one tenant to compare.

---

## 5. The events

### 5.1 Reach — `apps/www`

| Event | | Fires when | Properties |
|---|---|---|---|
| `waitlist.joined` | **C** core | the form succeeds | `source` (already an arg), `has_instagram`, `has_name` |

The marketing site is one page; `$pageview` plus autocapture covers the rest.
`source` already exists as a mutation argument — it should be the same value,
not a second scheme.

### 5.2 Account and activation — `apps/app`

| Event | | Fires when | Properties |
|---|---|---|---|
| `signin.code_requested` | **C** core | the email step submits | `is_returning` (a code has been requested on this device before) |
| `signin.completed` | **C** core | auth resolves | — |
| `account.created` | **A** core | first sign-in writes the account | — |
| `account.name_changed` | **A** later | `users.setName` | `was_first` — distinguishes completing sign-up from a later rename |
| `matchmaker.created` | **A** core | `matchmakers.create` | — |

`matchmaker.created` is **the activation event**. Everything in §6.1 is
measured against it.

> **Gap worth naming:** nothing distinguishes a *failed* sign-in code from one
> never submitted. If §6.1 shows drop-off at the code step, that is the next
> event to add — not now.

### 5.3 Filling the book

| Event | | Fires when | Properties |
|---|---|---|---|
| `candidate.created` | **A** core | `candidates.onboard` | `has_social`, `social_platform`, `fields_filled` (count) |
| `invite.sent` | **A** core | invite issued | `trigger`: `onboard` / `resend` / `reinvite` |
| `invite.accepted` | **A** core | `invites.accept` | `hours_to_accept` (bucketed) |
| `invite.declined` | **A** core | `invites.decline` | — |
| `invite.expired` | **A** core | the expiry job clears it | — |
| `invite.revoked` | **A** later | `invites.revoke` | — |
| `invite.email_changed` | **A** later | `invites.changeEmail` | — |
| `candidate.status_changed` | **A** later | `candidates.setStatus` | `from`, `to` (`active`/`paused`/`archived`) |
| `membership.left` | **A** core | `candidates.leave` | `has_reason`, `days_joined` (bucketed) |

`invite.sent → accepted / declined / expired` is the funnel the product lives
or dies on, and **expired has to be in it**. An invite nobody answered is the
commonest outcome and the easiest to leave uncounted, which would quietly
inflate the acceptance rate.

### 5.4 The conversation

| Event | | Fires when | Properties |
|---|---|---|---|
| `message.sent` | **S** core | `messages.send` / `sendAsCandidate` | `role`: `matchmaker`/`candidate`; `length_bucket`; `is_first_in_thread`; `from_suggestion` (bool) |
| `conversation.opened` | **C** later | the conversation page renders a thread | `unread_count` bucket |

Messages are **not audited** — deliberately, since the audit trail is about
changes to a record and a message is the record. So `message.sent` needs its own
emit (**S**), in the mutation rather than the browser: a candidate's reply
arriving by a channel the browser never sees is exactly the thing worth
counting.

**`from_suggestion` is the single most valuable property in this document.** It
is what turns "the AI wrote 400 replies" into "the AI wrote 400 replies that
were actually sent". It needs `replySuggestions.send` to mark the message it
creates — a small backend change, worth making before instrumenting rather
than after.

### 5.5 The AI's offer

This is the section the product's claim rests on, and the one to keep if
everything else is cut.

| Event | | Fires when | Properties |
|---|---|---|---|
| `reply_suggestion.offered` | **S** core | a draft is written for a thread | `agent` (`conversation`) |
| `reply_suggestion.sent` | **S** core | `replySuggestions.send` | `edited` (bool — did they change it first) |
| `reply_suggestion.dismissed` | **S** core | `replySuggestions.dismiss` | — |
| `reply_suggestion.toggled` | **C** later | `setEnabled` | `enabled` |
| `profile.suggested` | **A** core | an agent proposes an entry | `kind`, `agent` |
| `profile.suggestion_accepted` | **A** core | the matchmaker accepts | `kind` |
| `profile.suggestion_rejected` | **A** core | the matchmaker rejects | `kind` |
| `profile.updated` | **A** later | any entry write | `kind`, `source`: `matchmaker`/`agent`/`agent_approved` |
| `matchmaker_profile.suggestion_accepted` | **A** later | voice suggestion accepted | — |
| `matchmaker_profile.suggestion_rejected` | **A** later | voice suggestion rejected | — |

**offered / accepted / rejected, per agent, is the acceptance rate** — the
number that says whether the agents are worth their tokens. It is also the only
thing that makes `/admin/usage` actionable: cost per generation is a bill,
cost per *accepted* suggestion is a price.

`reply_suggestion.offered` has no audit record today. It is the denominator, so
without it the other two are unreadable.

### 5.6 The board

| Event | | Fires when | Properties |
|---|---|---|---|
| `match.suggested` | **A** core | the nightly run writes a card | `score_bucket`, `coverage_bucket` |
| `match.created` | **A** core | `matches.create` | `origin`: `manual`/`run` |
| `match.stage_changed` | **A** core | `matches.moveStage` | `from`, `to` |
| `match.closed` | **A** core | `matches.close` | `outcome`: `together`/`didnt_work`; `closed_by`; `archive_both`; `has_note` |
| `board.refreshed` | **C** later | `matches.refresh` from the UI | `new_cards` |

`match.closed` with `outcome` and `closed_by` is the only place the product
learns whether it was *right*. `closed_by: system` — the run taking back its own
suggestion — is worth watching on its own.

### 5.7 Notifications

| Event | | Fires when | Properties |
|---|---|---|---|
| `push.subscribed` | **C** core | `subscribePush` succeeds | `permission`: `granted`/`denied`/`dismissed` |
| `push.unsubscribed` | **C** later | `unsubscribePush` | — |
| `notifications.channels_changed` | **C** later | `setChannels` | which channels, as booleans |

Push is **C**, not S: the interesting half is the browser permission prompt,
which the backend never sees. A denial is not a mutation at all.

### 5.8 Account lifecycle

| Event | | Fires when | Properties |
|---|---|---|---|
| `account.deleted` | **A** core | `users.deleteAccount` | `had_matchmaker`, `days_since_created` (bucketed) |
| `account.erased` | **A** later | `admin.eraseAccount` | — |

An erasure erasing the person from Convex while their behaviour stays in
PostHog is the open question on #3. Until it is answered, `account.erased`
arguably should *not* be sent — it would be a third-party record that an
erasure happened, keyed to the id just erased.

---

## 6. The questions this is for

Three, and every `core` event above earns its place against one of them.

### 6.1 Does a matchmaker get to a working book?
`signin.completed → matchmaker.created → candidate.created → invite.sent →
invite.accepted → message.sent{role:candidate}`

The last step is the real one. A book of invited people who never replied is not
a book, and the first four steps can all look healthy while it is empty.

### 6.2 Is the AI worth its tokens?
`reply_suggestion.offered → sent` and `profile.suggested → suggestion_accepted`,
split by agent, joined to `/admin/usage`. Acceptance rate is the number; cost
per accepted suggestion is the one to put next to it.

### 6.3 Does the product make matches that hold?
`match.suggested → created → stage_changed → closed{outcome}`, and the share of
`closed_by: system`.

---

## 7. Deliberately excluded

- **A `$pageview` for every screen as a named event.** Tier 1 already reports
  routes as masked patterns; a `page.viewed` event would be the same fact twice.
- **Anything in `apps/admin`.** Staff-only, uninstrumented on purpose.
- **Autocapture-shaped events** — clicks, form focus, rage clicks. Already
  captured, and naming them invites a parallel taxonomy that drifts.
- **Timing events.** Real, but `$pageview` timings and the funnel's own
  timestamps answer most of it; add one when a specific question needs it.
- **Anything carrying message, note or profile *content*.** §3, and not
  negotiable.

## 8. Open decisions

1. **`from_suggestion` on `message.sent`** needs `replySuggestions.send` to mark
   the message it produced. Small change, but it belongs *before* the
   instrumentation. Confirm it is wanted.
2. **`reply_suggestion.offered` has no record today** — a draft is written and
   either used or not. Emit at write time (**S**), or add an audit action for it?
   The second is more consistent; the first is cheaper.
3. ~~**Does the `recordAudit` emitter ship before the client events?**~~ Yes —
   shipped (`convex/analytics/`). It needs `POSTHOG_API_KEY` set on the
   deployment before it sends anything.
4. **`account.erased`** — send it at all? See §5.8 and #3.
5. **Group properties on the matchmaker** (`candidate_count` etc.) mean writing
   tenant size to a third party. Cheap and useful; still a disclosure.
6. **Sampling.** None proposed. At current volumes every event fits; worth
   revisiting before it doesn't.
