import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { matchesAuditFilter } from "./rules";

/**
 * Reading a candidate's trail (prd/phase-1.md §5.2). Only their matchmaker
 * can: every event carries `matchmakerId`, and this checks it before reading
 * a thing. Candidates never see the trail at all.
 */

const auditEvent = v.object({
  _id: v.id("auditEvents"),
  _creationTime: v.number(),
  action: v.string(),
  /** Who did it: the matchmaker themselves, the candidate, or a job. */
  actor: v.union(
    v.object({
      kind: v.union(
        v.literal("matchmaker"),
        v.literal("candidate"),
        v.literal("account"),
        // A platform admin acting on the account (see convex/admin/).
        v.literal("platform_admin"),
      ),
      name: v.string(),
    }),
    v.object({ kind: v.literal("system"), name: v.string() }),
    // An AI agent (prd/phase-2.md §3). `name` is the model it ran on, so a
    // matchmaker reading the trail can tell a change made by a model they are
    // using now from one made by a model that has since been replaced.
    v.object({ kind: v.literal("agent"), name: v.string() }),
  ),
  changes: v.array(
    v.object({
      field: v.string(),
      before: v.optional(v.string()),
      after: v.optional(v.string()),
    }),
  ),
  reason: v.optional(v.string()),
});

type AuditActorDoc = Doc<"auditEvents">["actor"];
type RenderedActor = Infer<typeof auditEvent>["actor"];

/** One rendering of an actor, shared by every query that reads the trail. */
async function describeActor(
  actor: AuditActorDoc,
  nameOf: (userId: Id<"users">) => Promise<string>,
): Promise<RenderedActor> {
  switch (actor.type) {
    case "system":
      return { kind: "system", name: actor.job };
    case "agent":
      return { kind: "agent", name: actor.model };
    default:
      return { kind: actor.role, name: await nameOf(actor.userId) };
  }
}

export const candidateHistory = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    // One literal per key in AUDIT_FILTERS (`audit/rules.ts`).
    filter: v.union(
      v.literal("all"),
      v.literal("details"),
      v.literal("membership"),
      v.literal("profile"),
      v.literal("matches"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(auditEvent),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);

    const page = await ctx.db
      .query("auditEvents")
      .withIndex("by_candidateId", (q) => q.eq("candidateId", candidate._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const names = new Map<string, string>();
    const nameOf = async (userId: Id<"users">) => {
      const cached = names.get(userId);
      if (cached !== undefined) return cached;
      const user = await ctx.db.get("users", userId);
      const name = user?.name ?? user?.email ?? "Someone";
      names.set(userId, name);
      return name;
    };

    const events: Infer<typeof auditEvent>[] = [];
    for (const event of page.page) {
      // A filter is applied after paging, so a page can come back short; the
      // app pages on until `isDone`. Filtering in the index would need one
      // index per filter for a list this small.
      if (!matchesAuditFilter(event.action, args.filter)) continue;
      events.push({
        _id: event._id,
        _creationTime: event._creationTime,
        action: event.action,
        actor: await describeActor(event.actor, nameOf),
        changes: event.changes ?? [],
        reason: event.reason,
      });
    }
    return { ...page, page: events };
  },
});
