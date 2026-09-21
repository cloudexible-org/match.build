import {
  type NamedTableInfo,
  paginationOptsValidator,
  paginationResultValidator,
  type Query,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { agentSettings, aiEnabled, storedAgentSettings } from "../ai/helpers";
import { AI_AGENT_IDS } from "../ai/rules";
import { auditActor } from "../schema";
import { accountLabel, getAdminSession, requirePlatformAdmin } from "./helpers";
import {
  ACCOUNT_SEARCH_LIMIT,
  ACCOUNT_SEARCH_MIN_LENGTH,
  type AuditFilters,
  auditFiltersError,
  emailPrefixRange,
  MAX_AUDIT_PAGE_SIZE,
} from "./rules";

/**
 * Everything here reads across every tenant, so each function starts with
 * `requirePlatformAdmin` rather than the tenant helpers.
 */

/**
 * The signed-in account and whether it may use the admin app, or `null` when
 * signed out. The only function here a non-admin may call: the app needs it to
 * tell "not an admin" apart from "signed out".
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      isAdmin: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const session = await getAdminSession(ctx);
    if (session === null) return null;
    return {
      email: session.user.email,
      name: session.user.name,
      isAdmin: session.isAdmin,
    };
  },
});

// Filter pickers list at most this many; far above phase-1 volumes.
const MAX_PICKER_ROWS = 500;

/** Every matchmaker profile, newest first, for the audit trail's filter. */
export const matchmakers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("matchmakers"),
      username: v.string(),
      displayName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const rows = await ctx.db
      .query("matchmakers")
      .order("desc")
      .take(MAX_PICKER_ROWS);
    return rows.map((row) => ({
      _id: row._id,
      username: row.username,
      displayName: row.displayName,
    }));
  },
});

/** One matchmaker's candidates, for the audit trail's filter. */
export const candidates = query({
  args: { matchmakerId: v.id("matchmakers") },
  returns: v.array(
    v.object({
      _id: v.id("candidates"),
      label: v.string(),
      email: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const rows = await ctx.db
      .query("candidates")
      .withIndex("by_matchmakerId_and_status", (q) =>
        q.eq("matchmakerId", args.matchmakerId),
      )
      .take(MAX_PICKER_ROWS);
    return rows.map((row) => ({
      _id: row._id,
      label: row.name ?? row.email,
      email: row.email,
    }));
  },
});

const accountSummary = v.object({
  _id: v.id("users"),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  verified: v.boolean(),
  deleted: v.boolean(),
});

function summariseAccount(user: Doc<"users">) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    verified: user.emailVerificationTime !== undefined,
    deleted: user.deletedAt !== undefined,
  };
}

/**
 * Accounts whose email starts with `search` (case-insensitive), for issuing
 * sign-in codes and filtering the audit trail. Nothing until the search is
 * `ACCOUNT_SEARCH_MIN_LENGTH` characters long.
 */
export const searchAccounts = query({
  args: { search: v.string() },
  returns: v.array(accountSummary),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (args.search.trim().length < ACCOUNT_SEARCH_MIN_LENGTH) return [];
    const { start, end } = emailPrefixRange(args.search);
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.gte("email", start).lt("email", end))
      .take(ACCOUNT_SEARCH_LIMIT);
    return users.map(summariseAccount);
  },
});

/** One account by id, or `null`: labels the audit trail's account filter. */
export const account = query({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), accountSummary),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    return user === null ? null : summariseAccount(user);
  },
});

const auditRow = v.object({
  _id: v.id("auditEvents"),
  _creationTime: v.number(),
  action: v.string(),
  actor: auditActor,
  actorLabel: v.union(v.null(), v.string()),
  matchmaker: v.union(
    v.null(),
    v.object({
      _id: v.id("matchmakers"),
      username: v.string(),
      displayName: v.string(),
    }),
  ),
  candidate: v.union(
    v.null(),
    v.object({ _id: v.id("candidates"), label: v.string() }),
  ),
  entityTable: v.string(),
  entityId: v.string(),
  // The account an account-level event is about, e.g. whose sign-in code a
  // platform admin issued.
  accountLabel: v.union(v.null(), v.string()),
  changes: v.array(
    v.object({
      field: v.string(),
      before: v.optional(v.string()),
      after: v.optional(v.string()),
    }),
  ),
  relatedEntityId: v.optional(v.string()),
  reason: v.optional(v.string()),
});

/**
 * The whole platform's audit trail, newest first, optionally narrowed to one
 * matchmaker or candidate *or* one acting account, and to one action. Every
 * combination has its own index (schema.ts), so no page scans.
 */
export const auditTrail = query({
  args: {
    paginationOpts: paginationOptsValidator,
    matchmakerId: v.optional(v.id("matchmakers")),
    candidateId: v.optional(v.id("candidates")),
    actorUserId: v.optional(v.id("users")),
    action: v.optional(v.string()),
  },
  returns: paginationResultValidator(auditRow),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const { paginationOpts, ...filters } = args;
    const invalid = auditFiltersError(filters);
    if (invalid !== null) throw new ConvexError(invalid);

    const result = await auditEvents(ctx, filters)
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, MAX_AUDIT_PAGE_SIZE),
      });

    const labels = new Labels(ctx);
    const page = [];
    for (const event of result.page) {
      page.push({
        _id: event._id,
        _creationTime: event._creationTime,
        action: event.action,
        actor: event.actor,
        actorLabel:
          event.actor.type === "user"
            ? await labels.user(event.actor.userId)
            : null,
        matchmaker:
          event.matchmakerId === undefined
            ? null
            : await labels.matchmaker(event.matchmakerId),
        candidate:
          event.candidateId === undefined
            ? null
            : await labels.candidate(event.candidateId),
        entityTable: event.entityTable,
        entityId: event.entityId,
        accountLabel:
          event.entityTable === "users"
            ? await labels.userByString(event.entityId)
            : null,
        changes: event.changes ?? [],
        relatedEntityId: event.relatedEntityId,
        reason: event.reason,
      });
    }
    return { ...result, page };
  },
});

type AuditQuery = Query<NamedTableInfo<DataModel, "auditEvents">>;

/**
 * The index for a filter combination. A candidate implies its matchmaker, so
 * it wins over one; `auditFiltersError` has already refused a subject and an
 * account together.
 */
function auditEvents(
  ctx: QueryCtx,
  filters: AuditFilters<Id<"matchmakers">, Id<"candidates">, Id<"users">>,
): AuditQuery {
  const table = ctx.db.query("auditEvents");
  const { matchmakerId, candidateId, actorUserId, action } = filters;

  if (candidateId !== undefined) {
    return action === undefined
      ? table.withIndex("by_candidateId", (q) =>
          q.eq("candidateId", candidateId),
        )
      : table.withIndex("by_candidateId_and_action", (q) =>
          q.eq("candidateId", candidateId).eq("action", action),
        );
  }
  if (matchmakerId !== undefined) {
    return action === undefined
      ? table.withIndex("by_matchmakerId", (q) =>
          q.eq("matchmakerId", matchmakerId),
        )
      : table.withIndex("by_matchmakerId_and_action", (q) =>
          q.eq("matchmakerId", matchmakerId).eq("action", action),
        );
  }
  if (actorUserId !== undefined) {
    return action === undefined
      ? table.withIndex("by_actor_userId", (q) =>
          q.eq("actor.userId", actorUserId),
        )
      : table.withIndex("by_actor_userId_and_action", (q) =>
          q.eq("actor.userId", actorUserId).eq("action", action),
        );
  }
  if (action !== undefined) {
    return table.withIndex("by_action", (q) => q.eq("action", action));
  }
  return table;
}

/** Per-request lookups for audit rows, so a busy page reads each doc once. */
class Labels {
  private users = new Map<Id<"users">, string | null>();
  private matchmakers = new Map<
    Id<"matchmakers">,
    { _id: Id<"matchmakers">; username: string; displayName: string } | null
  >();
  private candidates = new Map<
    Id<"candidates">,
    { _id: Id<"candidates">; label: string } | null
  >();

  private readonly ctx: QueryCtx;

  constructor(ctx: QueryCtx) {
    this.ctx = ctx;
  }

  async user(userId: Id<"users">): Promise<string | null> {
    if (!this.users.has(userId)) {
      this.users.set(
        userId,
        accountLabel(await this.ctx.db.get("users", userId)),
      );
    }
    return this.users.get(userId) ?? null;
  }

  /** `entityId` is stored as a string; only a valid users id is looked up. */
  async userByString(entityId: string): Promise<string | null> {
    const userId = this.ctx.db.normalizeId("users", entityId);
    return userId === null ? null : await this.user(userId);
  }

  async matchmaker(matchmakerId: Id<"matchmakers">) {
    if (!this.matchmakers.has(matchmakerId)) {
      const doc = await this.ctx.db.get("matchmakers", matchmakerId);
      this.matchmakers.set(
        matchmakerId,
        doc === null
          ? null
          : {
              _id: doc._id,
              username: doc.username,
              displayName: doc.displayName,
            },
      );
    }
    return this.matchmakers.get(matchmakerId) ?? null;
  }

  async candidate(candidateId: Id<"candidates">) {
    if (!this.candidates.has(candidateId)) {
      const doc = await this.ctx.db.get("candidates", candidateId);
      this.candidates.set(
        candidateId,
        doc === null ? null : { _id: doc._id, label: doc.name ?? doc.email },
      );
    }
    return this.candidates.get(candidateId) ?? null;
  }
}

/*
 * ─── AI agents (prd/phase-2.md §4.4) ────────────────────────────────────────
 */

/**
 * The three agents exactly as stored — no substitution, because there is no
 * default to substitute. An agent nobody has configured comes back empty and
 * off, with `offReason` saying which of the four ways it is off.
 *
 * Whether the deployment can reach a model at all comes back too: an agent can
 * be configured and switched on and still have nothing to call, and a page that
 * doesn't say so implies these settings are already doing something.
 */
export const aiAgents = query({
  args: {},
  returns: v.object({
    aiEnabled: v.boolean(),
    agents: v.array(
      v.object({
        agent: v.string(),
        label: v.string(),
        does: v.string(),
        enabled: v.boolean(),
        model: v.string(),
        systemPrompt: v.string(),
        exists: v.boolean(),
        offReason: v.union(v.string(), v.null()),
        updatedAt: v.optional(v.number()),
        /** The admin who last saved it, or absent when the seed wrote it. */
        updatedBy: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const agents = [];
    for (const agent of AI_AGENT_IDS) {
      const settings = await agentSettings(ctx, agent);
      const stored = await storedAgentSettings(ctx, agent);
      const editor =
        stored?.updatedByUserId === undefined
          ? null
          : await ctx.db.get("users", stored.updatedByUserId);
      agents.push({
        agent,
        label: settings.label,
        does: settings.does,
        enabled: settings.enabled,
        model: settings.model,
        systemPrompt: settings.systemPrompt,
        exists: settings.exists,
        offReason: settings.offReason,
        updatedAt: stored?.updatedAt,
        updatedBy: editor?.email ?? undefined,
      });
    }
    return { aiEnabled: aiEnabled(), agents };
  },
});
