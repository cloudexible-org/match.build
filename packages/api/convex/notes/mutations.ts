import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { type MutationCtx, mutation } from "../_generated/server";
import { recordAudit } from "../audit/helpers";
import { assertSameTenant, requireMatchmaker } from "../matchmakers/helpers";
import { normaliseNoteBody, noteBodyError } from "./rules";

/**
 * The matchmaker's private notes on a candidate (prd/phase-1.md §4.1).
 * Candidates never see them, and nothing is hard-deleted: removing sets
 * `removedAt` and is audited like every other change.
 */

/** The note, if it belongs to this matchmaker and this candidate. */
async function requireNote(
  ctx: MutationCtx,
  args: { matchmakerId: Id<"matchmakers">; noteId: Id<"notes"> },
) {
  const { user, matchmaker } = await requireMatchmaker(ctx, args.matchmakerId);
  const note = await ctx.db.get("notes", args.noteId);
  assertSameTenant(note, matchmaker._id);
  return { user, note };
}

export const create = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    candidateId: v.id("candidates"),
    body: v.string(),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const { user, matchmaker } = await requireMatchmaker(
      ctx,
      args.matchmakerId,
    );
    const candidate = await ctx.db.get("candidates", args.candidateId);
    assertSameTenant(candidate, matchmaker._id);
    const invalid = noteBodyError(args.body);
    if (invalid) throw new ConvexError(invalid);

    const body = normaliseNoteBody(args.body);
    const noteId = await ctx.db.insert("notes", {
      matchmakerId: matchmaker._id,
      candidateId: candidate._id,
      body,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      matchmakerId: matchmaker._id,
      candidateId: candidate._id,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "note.created",
      entity: { table: "notes", id: noteId },
      changes: [{ field: "note", after: body }],
    });
    return noteId;
  },
});

export const edit = mutation({
  args: {
    matchmakerId: v.id("matchmakers"),
    noteId: v.id("notes"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, note } = await requireNote(ctx, args);
    if (note.removedAt !== undefined) {
      throw new ConvexError("That note was removed.");
    }
    const invalid = noteBodyError(args.body);
    if (invalid) throw new ConvexError(invalid);

    const body = normaliseNoteBody(args.body);
    if (body === note.body) return null;
    await ctx.db.patch("notes", note._id, { body, updatedAt: Date.now() });
    await recordAudit(ctx, {
      matchmakerId: note.matchmakerId,
      candidateId: note.candidateId,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "note.edited",
      entity: { table: "notes", id: note._id },
      changes: [{ field: "note", before: note.body, after: body }],
    });
    return null;
  },
});

/** "Removed" in the UI; the row stays, as everything does (prd §6). */
export const remove = mutation({
  args: { matchmakerId: v.id("matchmakers"), noteId: v.id("notes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, note } = await requireNote(ctx, args);
    if (note.removedAt !== undefined) return null;
    await ctx.db.patch("notes", note._id, { removedAt: Date.now() });
    await recordAudit(ctx, {
      matchmakerId: note.matchmakerId,
      candidateId: note.candidateId,
      actor: { type: "user", userId: user._id, role: "matchmaker" },
      action: "note.removed",
      entity: { table: "notes", id: note._id },
      changes: [{ field: "note", before: note.body }],
    });
    return null;
  },
});
