import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Phase 1 schema — see `prd/phase-1.md` §6.
 *
 * Tenancy: every row that belongs to a matchmaker carries `matchmakerId`, and
 * every function reaches it through the access helpers in `users/`,
 * `matchmakers/` and `candidates/` (`helpers.ts`), never from arguments alone.
 *
 * Nothing is hard-deleted from the product tables: removals are soft
 * (`deletedAt`, `removedAt`, `membership`) and every meaningful change is
 * recorded in `auditEvents`. Only auth plumbing (sessions, credentials) is
 * ever deleted.
 */

export const socialPlatform = v.union(
  v.literal("instagram"),
  v.literal("whatsapp"),
  v.literal("tiktok"),
  v.literal("facebook"),
  v.literal("x"),
  v.literal("linkedin"),
  v.literal("other"),
);

/** The three agents (prd/phase-2.md §4.1), as `ai/rules.ts` names them. */
export const aiAgentId = v.union(
  v.literal("conversation"),
  v.literal("candidate_profile"),
  v.literal("voice_profile"),
);

export const auditActor = v.union(
  v.object({
    type: v.literal("user"),
    userId: v.id("users"),
    role: v.union(
      v.literal("account"),
      v.literal("matchmaker"),
      v.literal("candidate"),
      // Someone listed in PLATFORM_ADMIN_EMAILS, acting from apps/admin.
      v.literal("platform_admin"),
    ),
  }),
  // A scheduled job, e.g. "invite_expiry".
  v.object({ type: v.literal("system"), job: v.string() }),
  // An AI agent, writing to a record it owns (prd/phase-2.md §3). Carries the
  // model it ran on, because "the assistant changed this" is only half an
  // answer once the model behind an agent has moved on.
  v.object({
    type: v.literal("agent"),
    agent: aiAgentId,
    model: v.string(),
  }),
);

/**
 * One value in a profile, and everything that is true *about* the value
 * (prd/phase-2.md §3).
 *
 * `value` is the normalised string `profiles/rules.ts` produced — never raw
 * input. An entry with an empty `value` is one nothing has been recorded for
 * yet, held open only by a `pending` proposal; `source` on such an entry says
 * nothing and nothing renders it.
 */
export const profileEntry = v.object({
  value: v.string(),
  // Who put the current value there. Distinct from the field's write policy,
  // which is the rule and lives in `profiles/rules.ts`.
  source: v.union(
    v.literal("matchmaker"),
    v.literal("agent"),
    v.literal("agent_approved"),
  ),
  updatedAt: v.number(),
  updatedByUserId: v.optional(v.id("users")), // absent when an agent wrote it
  model: v.optional(v.string()),
  sourceMessageId: v.optional(v.id("messages")),
  sourceQuote: v.optional(v.string()), // verbatim, so a matchmaker can check
  confidence: v.optional(v.number()), // 0..1, from the agent that proposed it
  // An agent's proposal, waiting on the matchmaker. It sits BESIDE the current
  // value rather than replacing it — a suggestion that overwrote what it is
  // suggesting a change to would not be a suggestion.
  //
  // **At most one at a time.** A later run that finds something newer about
  // the same field replaces the proposal rather than queuing behind it: two
  // open questions about one field is a worse thing to hand someone than the
  // current best answer. The one it replaced is in the audit trail.
  pending: v.optional(
    v.object({
      // What is being proposed: a value, or that the entry go entirely. An
      // agent learns that something is no longer true as often as it learns
      // what is, and "" would not be a way of saying so — an entry whose
      // value is "" is one nothing has been recorded for.
      action: v.union(v.literal("set"), v.literal("clear")),
      value: v.string(), // "" when the action is "clear"
      suggestedAt: v.number(),
      model: v.string(),
      confidence: v.optional(v.number()),
      sourceMessageId: v.optional(v.id("messages")),
      sourceQuote: v.optional(v.string()),
    }),
  ),
});

/** The match board's three columns, and the closed state off it. */
export const matchStage = v.union(
  v.literal("proposed"),
  v.literal("introduced"),
  v.literal("connected"),
  v.literal("closed"),
);

/** How a match ended (prd/phase-3.md §2). */
export const matchOutcome = v.union(
  v.literal("together"),
  v.literal("didnt_work"),
);

export const matchClosedBy = v.union(
  v.literal("matchmaker"),
  v.literal("candidateA"),
  v.literal("candidateB"),
  // The nightly run taking back its own suggestion after a profile changed
  // under it: the one ending nobody chose.
  v.literal("system"),
);

/**
 * One reason a pair scored what it did (`matches/rules.ts`). The run stores
 * what it saw — `detail` is a sentence about these two people, not a template —
 * so a card still explains itself after the profiles behind it have moved on.
 */
export const matchSignal = v.object({
  key: v.string(), // a key in MATCH_SIGNAL_LABELS
  weight: v.number(),
  earned: v.number(), // 0..1 of the weight
  detail: v.string(),
});

export default defineSchema({
  // Convex Auth's sessions, accounts, verification codes, refresh tokens, …
  ...authTables,

  // Replaces `authTables.users` to add soft deletion. Keeps every field and
  // index Convex Auth reads (`email`, `phone`).
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()), // trimmed + lowercased
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()), // set on account deletion; the row stays
    // The open confirmation code for deleting this account (prd/phase-1.md
    // §3.5). Beyond the PRD's schema: deletion is confirmed with a fresh
    // one-time code, and the code has to live somewhere. Like an invite, only
    // its hash is stored, and it is cleared once spent or replaced. It is not
    // a credential: it can't sign anyone in, only confirm a deletion the
    // signed-in account asked for.
    deletionCode: v.optional(
      v.object({
        codeHash: v.string(), // SHA-256 of the six digits; never the code
        expiresAt: v.number(),
        attempts: v.number(), // wrong guesses; the code dies after a few
      }),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  matchmakers: defineTable({
    ownerUserId: v.id("users"),
    username: v.string(), // chosen form, lowercase, may contain dots; used in URLs
    usernameKey: v.string(), // canonical form, dots removed; unique
    displayName: v.string(),
    businessName: v.optional(v.string()),
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_usernameKey", ["usernameKey"]),

  // A person's standing with ONE matchmaker: the matchmaker's record of them,
  // scoped to that tenant. Not the person — that's `users`. It exists from the
  // moment the matchmaker onboards someone, before they have an account, and
  // links to a user once they join. One person can have many of these rows
  // (one per matchmaker); never more than one per (matchmakerId, userId).
  //
  // Also carries the invitation (prd/phase-1.md §3.2): while `membership` is
  // "invited", `invite` holds the current link. Re-issuing overwrites it, which
  // is what invalidates the old link; the history lives in `auditEvents`.
  // Phase-3 Discover applications become rows with `membership: "applied"`.
  candidates: defineTable({
    matchmakerId: v.id("matchmakers"),
    userId: v.optional(v.id("users")), // set when an invitation is accepted
    name: v.optional(v.string()), // the matchmaker's label; falls back to the user's name
    email: v.string(), // as invited, trimmed + lowercased
    socialHandles: v.array(
      v.object({ platform: socialPlatform, handle: v.string() }),
    ),
    // The person's side: are they connected to this matchmaker?
    membership: v.union(
      v.literal("invited"),
      v.literal("declined"),
      v.literal("joined"),
      v.literal("left"),
      v.literal("account_deleted"),
    ),
    membershipChangedAt: v.number(),
    leaveReason: v.optional(v.string()),
    // The open invitation, if any. Absent once it is accepted, declined,
    // revoked or expired — only a candidate with an `invite` can be joined by
    // link or from the home page.
    invite: v.optional(
      v.object({
        tokenHash: v.string(), // SHA-256 of the link's token; the raw token is never stored
        // Random per issue. The token is derived from it with a deployment
        // secret (invites/helpers.ts), so the owner can copy the same link
        // again without the token ever being stored. Absent on invites
        // written before links were copyable (seeds); those can't be copied.
        nonce: v.optional(v.string()),
        expiresAt: v.number(),
        lastSentAt: v.optional(v.number()), // drives the resend rate limit
      }),
    ),
    // The matchmaker's side: their own workflow label, independent of membership.
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  })
    .index("by_matchmakerId_and_status", ["matchmakerId", "status"])
    // The notifications panel: this matchmaker's most recent membership
    // changes, newest first, without reading every candidate they have.
    .index("by_matchmakerId_and_membershipChangedAt", [
      "matchmakerId",
      "membershipChangedAt",
    ])
    .index("by_matchmakerId_and_email", ["matchmakerId", "email"])
    .index("by_userId_and_matchmakerId", ["userId", "matchmakerId"])
    // Home page invitations: every matchmaker's open invite to one address.
    .index("by_email_and_membership", ["email", "membership"])
    .index("by_invite_tokenHash", ["invite.tokenHash"]),

  conversations: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    lastSeq: v.number(), // last message of any visibility
    lastPublicSeq: v.number(), // last message visible to the candidate
    lastMessageAt: v.number(),
    matchmakerLastReadSeq: v.number(),
    candidateLastReadSeq: v.number(),

    // ─── The drafting agent's side of this conversation (prd/phase-2.md §4A)
    //
    // The matchmaker's own switch for this one conversation. **Absent means
    // on**, so only the exception is stored and there is nothing to backfill —
    // and turning it off is a deliberate act that leaves a record, while
    // leaving it on is the state of every conversation nobody has thought
    // about. The deployment's `AI_ENABLED` and the agent's own switch at
    // /admin/ai are still above this: it is how a matchmaker opts one
    // conversation out, not how the feature is turned on.
    aiOff: v.optional(v.boolean()),
    //
    // The agent is briefed once and then kept up to date, so what matters here
    // is how much of the world it has already been told about. The thread is
    // the component's (`@convex-dev/agent`), not ours: `ctx.db` cannot see it,
    // which is why an erasure has to reach it through the component's own API.
    agentThreadId: v.optional(v.string()),
    // The high-water marks of the last briefing. Absent together with the
    // thread; a conversation the agent has never drafted for has none.
    agentBriefedSeq: v.optional(v.number()),
    agentBriefedVoiceAt: v.optional(v.number()),
    agentBriefedProfileAt: v.optional(v.number()),
    // The debounce (§4A, ~5s). A burst of messages cancels the job the last
    // one scheduled and schedules its own, so one burst is one generation.
    draftJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_matchmakerId_and_lastMessageAt", [
      "matchmakerId",
      "lastMessageAt",
    ])
    .index("by_candidateId", ["candidateId"]),

  messages: defineTable({
    matchmakerId: v.id("matchmakers"),
    conversationId: v.id("conversations"),
    seq: v.number(), // monotonic within the conversation, allocated from conversations.lastSeq
    author: v.union(
      v.literal("matchmaker"),
      v.literal("candidate"),
      v.literal("system"),
    ),
    authorUserId: v.optional(v.id("users")),
    visibility: v.union(v.literal("everyone"), v.literal("matchmaker")),
    source: v.union(
      v.literal("typed"),
      v.literal("imported"), // pasted prior conversation from onboarding
      v.literal("system"),
      // Sent from a drafted reply (prd/phase-2.md §4A), edited or not. The
      // matchmaker sent it under their own name either way — this records how
      // it started, not who is answerable for it.
      v.literal("ai_suggestion"),
    ),
    body: v.string(),
    sentAt: v.number(),
  })
    .index("by_conversationId_and_seq", ["conversationId", "seq"])
    .index("by_conversationId_and_visibility_and_seq", [
      "conversationId",
      "visibility",
      "seq",
    ]),

  // The matchmaker's structured record of one person (prd/phase-2.md §3):
  // `facts` keyed by the registry in `profiles/rules.ts`, `notes` keyed by
  // whatever a matchmaker or an agent names.
  //
  // **One document per candidate, not one row per fact.** Every value carries
  // who wrote it, when, and an agent's proposal waiting on it — forty columns
  // would be forty nested objects, and adding a field would be a migration
  // every time. The registry holds the types instead, so a value is always a
  // normalised string and adding a field is an edit to one file.
  //
  // The history of a value is the audit trail, which is append-only and
  // already refuses to be rewritten — there is no supersession chain here,
  // because a second, less trustworthy copy of that history is worse than
  // none.
  candidateProfiles: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    facts: v.record(v.string(), profileEntry),
    notes: v.record(v.string(), profileEntry),
    updatedAt: v.number(),
  })
    .index("by_candidateId", ["candidateId"])
    .index("by_matchmakerId", ["matchmakerId"]),

  // What the product knows about the *matchmaker* (prd/phase-2.md §4.1C). The
  // same entry shape, and so the same rules about who may write it — but named
  // columns rather than a map, because this is a short, deliberate list rather
  // than a bag that grows with whatever a conversation turns up. So far there
  // is one: their voice, edited in their own settings and written by the
  // voice-profile agent only as a proposal they approve.
  matchmakerProfiles: defineTable({
    matchmakerId: v.id("matchmakers"),
    voice: v.optional(profileEntry),
    updatedAt: v.number(),
  }).index("by_matchmakerId", ["matchmakerId"]),

  // The assistant's drafted replies, waiting above the composer
  // (prd/phase-2.md §4A). Persisted rather than held in a browser: they
  // survive a reload, they are what the matchmaker actually sends, and going
  // stale is a state they have to be in somewhere.
  //
  // One row per draft, not one row per generation: the stack shows one card at
  // a time and arrows through the rest, so three drafts from one call are
  // three cards (`apps/app/src/chat/suggestion-stack.tsx`).
  replySuggestions: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    conversationId: v.id("conversations"),
    body: v.string(),
    // Which model wrote it. "The assistant drafted this" is half an answer
    // once the model behind an agent has moved on — the same reason the
    // `agent` audit actor carries one.
    model: v.string(),
    // The thread this was an answer to. A draft written for seq 7 is not an
    // answer to seq 8, which is what `stale` records.
    throughSeq: v.number(),
    status: v.union(
      v.literal("ready"),
      // A newer message arrived, or the matchmaker replied in their own
      // words. Kept rather than deleted: what was offered and passed over is
      // worth more than the row costs.
      v.literal("stale"),
      // Sent, as written or after an edit. The message it became is
      // `sentMessageId`.
      v.literal("sent"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    sentMessageId: v.optional(v.id("messages")),
  })
    // The open drafts for one candidate, which is the only read the app does.
    .index("by_candidateId_and_status", ["candidateId", "status"])
    .index("by_conversationId_and_status", ["conversationId", "status"])
    .index("by_matchmakerId", ["matchmakerId"]),
  // A pair of people in one matchmaker's book, and where the matchmaker has
  // got to with them (prd/phase-3.md §2, §4).
  //
  // **A match is between two people, not from one to another.** The ids are
  // stored in a fixed order and `pairKey` is the pair itself, unique across the
  // table — which is what stops tonight's run suggesting the same two people
  // last night's already did, and what makes "are they already on the board?"
  // one indexed read.
  //
  // `score`, `coverage` and `signals` are the nightly run's arithmetic, kept so
  // the card can say why (`matches/rules.ts`). Deliberately no AI: every number
  // here came from the deterministic algorithm, and `algorithmVersion` says
  // which version of it. A manual match carries them too, because a matchmaker
  // who pairs two people by hand still deserves to be told what the facts say.
  matches: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateAId: v.id("candidates"),
    candidateBId: v.id("candidates"),
    /** `"<lower id>:<higher id>"`, from `matches/rules.ts`. Unique. */
    pairKey: v.string(),
    origin: v.union(v.literal("algorithm"), v.literal("manual")),
    stage: matchStage,
    stageChangedAt: v.number(),
    score: v.optional(v.number()), // 0..100
    coverage: v.optional(v.number()), // 0..1, how much profile the score read
    signals: v.optional(v.array(matchSignal)),
    /** Either of them wrote a free-text dealbreaker, which no filter reads. */
    checkDealbreakers: v.optional(v.boolean()),
    algorithmVersion: v.optional(v.number()),
    lastScoredAt: v.optional(v.number()),
    // What closing recorded. Present only while `stage` is "closed": a match
    // moved back onto the board is not one that ended, so these are cleared
    // with it rather than left to be read as current.
    closedAs: v.optional(matchOutcome),
    closedBy: v.optional(matchClosedBy), // absent when they're together
    closingNote: v.optional(v.string()),
    // When the matchmaker first looked at this card. Absent means new, which
    // is the whole of what the "Reviewing" column used to say — and says it
    // without a card having to be dragged through a column to say it.
    seenAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    // The board: one query per column.
    .index("by_matchmakerId_and_stage", ["matchmakerId", "stage"])
    // Every card in a book, whatever stage — what the nightly run reads before
    // it suggests anything.
    .index("by_matchmakerId", ["matchmakerId"])
    .index("by_pairKey", ["pairKey"])
    // Both sides of every card one candidate is on, for their history and for
    // an erasure to find them.
    .index("by_candidateAId", ["candidateAId"])
    .index("by_candidateBId", ["candidateBId"]),

  // Append-only audit trail (prd/phase-1.md §5). Written only through
  // `recordAudit` in `audit/helpers.ts`, in the same mutation as the change.
  // Ordered by `_creationTime`.
  auditEvents: defineTable({
    matchmakerId: v.optional(v.id("matchmakers")), // absent only for account-level events
    candidateId: v.optional(v.id("candidates")),
    actor: auditActor,
    action: v.string(), // one of AUDIT_ACTIONS in audit/rules.ts
    entityTable: v.string(), // one of AUDIT_ENTITY_TABLES in audit/rules.ts
    entityId: v.string(),
    changes: v.optional(
      v.array(
        v.object({
          field: v.string(),
          before: v.optional(v.string()), // JSON-encoded
          after: v.optional(v.string()),
        }),
      ),
    ),
    relatedEntityId: v.optional(v.string()),
    reason: v.optional(v.string()),
  })
    .index("by_candidateId", ["candidateId"])
    .index("by_matchmakerId", ["matchmakerId"])
    .index("by_entityTable_and_entityId", ["entityTable", "entityId"])
    // The platform admin's filters (admin/queries.ts): one per combination it
    // offers, so no filter has to scan. A system actor has no `userId`, so its
    // events index under a missing value.
    .index("by_candidateId_and_action", ["candidateId", "action"])
    .index("by_matchmakerId_and_action", ["matchmakerId", "action"])
    .index("by_actor_userId", ["actor.userId"])
    .index("by_actor_userId_and_action", ["actor.userId", "action"])
    .index("by_action", ["action"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  notificationSettings: defineTable({
    userId: v.id("users"),
    emailEnabled: v.boolean(),
    pushEnabled: v.boolean(),
    // When this account last opened the in-app notifications panel. The whole
    // of "read" for that panel: its list is derived from conversations and
    // memberships, so an item is new when it happened after this, and there is
    // nothing per item to mark. Absent for an account that has never opened
    // it, which reads as "everything is new".
    //
    // Separate from the read markers on `conversations`: glancing at the bell
    // is not reading the message, and clearing one must never clear the other.
    feedSeenAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // One row per AI agent (prd/phase-2.md §4.4). **The only source of an agent's
  // model and standing instruction** — nothing in the code supplies a default,
  // so an agent nobody has configured is simply off rather than quietly running
  // on something. Seeded once (`convex/seed/ai/`), then owned by a platform
  // admin at /admin/ai.
  //
  // An agent runs only when its row exists, `enabled` is true, and neither
  // string is empty. Any of the four being false is a way of being off, and
  // `offReasonFor` in ai/rules.ts says which.
  //
  // Deliberately global rather than per matchmaker: one model and one standing
  // instruction for the whole platform. Per-matchmaker variation happens
  // through the voice profile, which is data a prompt reads, not a prompt of
  // its own. Every edit is audited with the old text in the event, which is
  // what keeps the prompt's history.
  aiAgentSettings: defineTable({
    agent: aiAgentId,
    enabled: v.boolean(),
    model: v.string(), // "" means off
    systemPrompt: v.string(), // "" means off
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")), // absent when seeded
  }).index("by_agent", ["agent"]),

  // One row per (conversation, recipient, channel) notification attempt.
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
  }).index("by_conversationId_and_userId_and_channel", [
    "conversationId",
    "userId",
    "channel",
  ]),

  // Emails that were *not* sent because no RESEND_API_KEY is configured —
  // local development and the e2e backend. Internal only: it can hold sign-in
  // codes and invite links in plain text, and nothing on the public API
  // reads it.
  emailOutbox: defineTable({
    to: v.string(),
    kind: v.union(
      v.literal("sign_in_code"),
      v.literal("invite"),
      v.literal("account_deletion_code"),
      v.literal("new_message"),
      v.literal("membership_changed"),
    ),
    subject: v.string(),
    text: v.string(),
  }).index("by_to", ["to"]),

  // Sign-ups from the marketing site (apps/www). Written only by
  // `waitlist.join`; nothing public reads it back.
  waitlist: defineTable({
    email: v.string(), // trimmed + lowercased, unique by convention
    name: v.optional(v.string()),
    instagram: v.optional(v.string()), // handle without the leading "@"
    source: v.string(), // which form on the site, e.g. "landing"
  }).index("by_email", ["email"]),
});
