import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { agentSettings, storedAgentSettings } from "../ai/helpers";
import { modelError, systemPromptError } from "../ai/rules";
import { recordAudit } from "../audit/helpers";
import { diffFields } from "../audit/rules";
import {
  anonymiseAccount,
  anonymiseCandidate,
  redactAuditEvents,
} from "../users/helpers";
import { isErasedEmail } from "../users/rules";
import { issueSignInCode, requirePlatformAdmin } from "./helpers";
import { ERASURE_LIMITS, erasureConfirmationError } from "./rules";

/**
 * Issues a sign-in code for any account, for a platform admin to sign in as it
 * (support, reproducing a bug). Nothing is emailed: the code comes back here,
 * and the admin enters it on the app's sign-in page under "I already have a
 * code". It lasts as long as an emailed code and replaces any unused one.
 *
 * Audited as `account.sign_in_code_issued` on the account, with the admin as
 * the actor, in the same mutation.
 */
export const issueSignInCodeFor = mutation({
  args: { userId: v.id("users") },
  returns: v.object({
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) throw new ConvexError("Account not found.");

    const issued = await issueSignInCode(ctx, user);
    await recordAudit(ctx, {
      actor: { type: "user", userId: admin._id, role: "platform_admin" },
      action: "account.sign_in_code_issued",
      entity: { table: "users", id: user._id },
    });
    return issued;
  },
});

/**
 * Erases a person at their request (prd/phase-1.md §12), resolving the one
 * place where "nothing is deleted" (§6) and the right to erasure genuinely
 * conflict.
 *
 * It erases the **person**, not the record. Everywhere their name, address and
 * handles appear — their account, every matchmaker's candidate record, and the
 * values inside the audit trail — is replaced with a stand-in. Everywhere the
 * *relationship* is recorded — the conversations, the messages, the
 * matchmakers' notes, and every audit event as an event — is left exactly as
 * it was. Each matchmaker keeps a complete history of work they did; none of
 * them can tell you who it was with.
 *
 * Deliberately **not** covered: the bodies of messages and notes. Those are
 * free text, and a matchmaker's notes are their own words; deciding whether a
 * particular request reaches into them is the controller's call and a legal
 * one, not something this function should guess (§9.3 — the matchmaker is the
 * controller, the platform is a processor).
 *
 * One transaction, with ceilings (`ERASURE_LIMITS`): it either finishes or
 * changes nothing. Running it twice is safe — the second run finds a person
 * who is already a stand-in and has nothing left to do.
 */
export const eraseAccount = mutation({
  args: { userId: v.id("users"), confirmEmail: v.string() },
  returns: v.object({
    candidates: v.number(),
    auditEventsRedacted: v.number(),
  }),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (user === null) throw new ConvexError("Account not found.");
    if (isErasedEmail(user.email)) {
      throw new ConvexError("This account has already been erased.");
    }
    const mistyped = erasureConfirmationError(args.confirmEmail, user.email);
    if (mistyped !== null) throw new ConvexError(mistyped);

    // A matchmaker's profile *is* a tenant: erasing its owner would leave
    // every candidate, conversation and note under an anonymous business.
    // Closing a matchmaker profile is its own piece of work (see the backlog).
    const owned = await ctx.db
      .query("matchmakers")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .first();
    if (owned !== null) {
      throw new ConvexError(
        "This account owns a matchmaker profile, so it can't be erased here.",
      );
    }

    const now = Date.now();
    const actor = {
      type: "user",
      userId: admin._id,
      role: "platform_admin",
    } as const;

    const memberships = await ctx.db
      .query("candidates")
      .withIndex("by_userId_and_matchmakerId", (q) => q.eq("userId", user._id))
      .take(ERASURE_LIMITS.memberships + 1);
    assertWithin(memberships, ERASURE_LIMITS.memberships, "candidate records");

    // The trail first, while the candidate rows still say who they were.
    let auditEventsRedacted = 0;
    for (const candidate of memberships) {
      const events = await ctx.db
        .query("auditEvents")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidate._id))
        .take(ERASURE_LIMITS.auditEvents + 1);
      assertWithin(events, ERASURE_LIMITS.auditEvents, "audit events");
      auditEventsRedacted += await redactAuditEvents(ctx, events);
    }
    // And the events they caused themselves, which include account-level ones
    // in no matchmaker's trail.
    const ownEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_actor_userId", (q) => q.eq("actor.userId", user._id))
      .take(ERASURE_LIMITS.auditEvents + 1);
    assertWithin(ownEvents, ERASURE_LIMITS.auditEvents, "audit events");
    auditEventsRedacted += await redactAuditEvents(ctx, ownEvents);

    // Then each matchmaker's record of them, each told in its own trail: their
    // book visibly changes, and an unexplained change is worse than the news.
    for (const candidate of memberships) {
      await anonymiseCandidate(ctx, candidate);
      await recordAudit(ctx, {
        matchmakerId: candidate.matchmakerId,
        candidateId: candidate._id,
        actor,
        action: "candidate.anonymised",
        entity: { table: "candidates", id: candidate._id },
      });
    }

    const { previousEmail } = await anonymiseAccount(ctx, user, now);
    await recordAudit(ctx, {
      actor,
      action: "account.erased",
      entity: { table: "users", id: user._id },
    });

    // Copies of them that are nobody's record of anything: emails we never
    // sent (which hold sign-in codes and invite links in plain text) and a
    // marketing sign-up. Neither is audited data, so both really go.
    if (previousEmail !== undefined) {
      const outbox = await ctx.db
        .query("emailOutbox")
        .withIndex("by_to", (q) => q.eq("to", previousEmail))
        .take(ERASURE_LIMITS.outboxEmails + 1);
      assertWithin(outbox, ERASURE_LIMITS.outboxEmails, "unsent emails");
      for (const email of outbox) await ctx.db.delete(email._id);

      const waiting = await ctx.db
        .query("waitlist")
        .withIndex("by_email", (q) => q.eq("email", previousEmail))
        .take(10);
      for (const row of waiting) await ctx.db.delete(row._id);
    }

    return { candidates: memberships.length, auditEventsRedacted };
  },
});

/** Refuses rather than erasing part of someone (see `ERASURE_LIMITS`). */
function assertWithin(rows: unknown[], limit: number, what: string): void {
  if (rows.length > limit) {
    throw new ConvexError(
      `This account has more than ${limit} ${what}, which is past what one erasure can do safely. Get in touch before retrying.`,
    );
  }
}

/*
 * ─── AI agents (prd/phase-2.md §4.4) ────────────────────────────────────────
 */

const agentId = v.union(
  v.literal("conversation"),
  v.literal("candidate_profile"),
  v.literal("voice_profile"),
);

/**
 * Sets one agent's switch, model and standing instruction, platform-wide. These
 * three fields are the only source of any of it: nothing in the code supplies a
 * model or a prompt, so an agent saved with an empty field is off, and that is
 * the intended way to turn one off.
 *
 * Audited as `ai_agent.updated` in the same mutation, with the whole previous
 * instruction in the event's `changes`. That is deliberately where a prompt's
 * history lives: the audit trail is already append-only and already refuses to
 * let anything rewrite it, so a separate versions table would be a second, less
 * trustworthy copy of the same thing. To read an old prompt, read the trail.
 *
 * A platform-level event has no `matchmakerId`, so it appears in the admin trail
 * and in no matchmaker's candidate history — which is right: it is our change to
 * how the product behaves, not a change to their book.
 */
export const setAiAgent = mutation({
  args: {
    agent: agentId,
    enabled: v.boolean(),
    model: v.string(),
    systemPrompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { agent, enabled, model, systemPrompt }) => {
    const admin = await requirePlatformAdmin(ctx);

    // Empty is allowed for both — it means off. A non-empty value still has to
    // be usable.
    const modelProblem = modelError(model);
    if (modelProblem) throw new ConvexError(modelProblem);
    const promptProblem = systemPromptError(systemPrompt);
    if (promptProblem) throw new ConvexError(promptProblem);

    const nextModel = model.trim();
    const nextPrompt = systemPrompt.trim();
    const existing = await storedAgentSettings(ctx, agent);
    const before = await agentSettings(ctx, agent);

    if (
      before.exists &&
      before.enabled === enabled &&
      before.model === nextModel &&
      before.systemPrompt === nextPrompt
    ) {
      // Nothing changed. Recording an event for a save that changed nothing
      // would make the trail harder to read, not more complete.
      return null;
    }

    if (existing === null) {
      await ctx.db.insert("aiAgentSettings", {
        agent,
        enabled,
        model: nextModel,
        systemPrompt: nextPrompt,
        updatedAt: Date.now(),
        updatedByUserId: admin._id,
      });
    } else {
      await ctx.db.patch("aiAgentSettings", existing._id, {
        enabled,
        model: nextModel,
        systemPrompt: nextPrompt,
        updatedAt: Date.now(),
        updatedByUserId: admin._id,
      });
    }

    await recordAudit(ctx, {
      actor: { type: "user", userId: admin._id, role: "platform_admin" },
      action: "ai_agent.updated",
      entity: { table: "aiAgentSettings", id: agent },
      changes: diffFields(
        {
          enabled: before.enabled,
          model: before.model,
          systemPrompt: before.systemPrompt,
        },
        { enabled, model: nextModel, systemPrompt: nextPrompt },
        ["enabled", "model", "systemPrompt"],
      ),
    });
    return null;
  },
});
