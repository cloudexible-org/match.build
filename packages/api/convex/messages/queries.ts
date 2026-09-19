import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCandidateSelf } from "../candidates/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { conversationFor, publicMessage } from "./helpers";

/**
 * Reading a thread (prd/phase-1.md §3.3). Both sides page backwards from the
 * newest message; the app reverses each page for display. Being Convex
 * queries, they stay subscribed, so a new message arrives without a refresh.
 */

/** What a thread page exposes: never a row's internal ids. */
const message = v.object({
  _id: v.id("messages"),
  seq: v.number(),
  author: v.union(
    v.literal("matchmaker"),
    v.literal("candidate"),
    v.literal("system"),
  ),
  visibility: v.union(v.literal("everyone"), v.literal("matchmaker")),
  source: v.union(
    v.literal("typed"),
    v.literal("imported"),
    v.literal("system"),
  ),
  body: v.string(),
  sentAt: v.number(),
});

/** The matchmaker's view: every message, private ones included. */
export const thread = query({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(message),
  handler: async (ctx, args) => {
    const { matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const conversation = await conversationFor(ctx, candidate._id);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_seq", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(publicMessage) };
  },
});

/**
 * The candidate's view: only `visibility: "everyone"`, through the index that
 * can't return anything else — the matchmaker's private messages and notes
 * are never reachable from here (§9.2).
 */
export const candidateThread = query({
  args: {
    candidateId: v.id("candidates"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(message),
  handler: async (ctx, args) => {
    const { candidate } = await requireCandidateSelf(ctx, args.candidateId);
    const conversation = await conversationFor(ctx, candidate._id);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_visibility_and_seq", (q) =>
        q.eq("conversationId", conversation._id).eq("visibility", "everyone"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(publicMessage) };
  },
});
