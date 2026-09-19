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

export const auditActor = v.union(
  v.object({
    type: v.literal("user"),
    userId: v.id("users"),
    role: v.union(
      v.literal("account"),
      v.literal("matchmaker"),
      v.literal("candidate"),
    ),
  }),
  // A scheduled job, e.g. "invite_expiry".
  v.object({ type: v.literal("system"), job: v.string() }),
);

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

  notes: defineTable({
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    body: v.string(),
    removedAt: v.optional(v.number()), // "removed" in the UI; the row stays
    updatedAt: v.number(),
  }).index("by_candidateId", ["candidateId"]),

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
    .index("by_entityTable_and_entityId", ["entityTable", "entityId"]),

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
  }).index("by_userId", ["userId"]),

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
  // codes in plain text, and nothing on the public API reads it.
  emailOutbox: defineTable({
    to: v.string(),
    kind: v.literal("sign_in_code"),
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
