import { internal } from "../_generated/api";
import { env, type MutationCtx } from "../_generated/server";
import type { AuditEventInput } from "../audit/helpers";
import { analyticsCapturesFor } from "./rules";

/**
 * Forwards one audit event to product analytics (docs/analytics-events.md
 * §1). Called by `recordAudit`, so every audited change reaches it without a
 * call site of its own — including the ones an agent or a cron makes, which
 * the browser never sees.
 *
 * Schedules the send rather than making it: a mutation cannot call out, and a
 * scheduled action only runs if the mutation commits, so a change that rolls
 * back is never counted. Does nothing without `POSTHOG_PROJECT_TOKEN`, which keeps
 * local development, convex-test and the e2e backend silent — the same gate
 * as the browser's provider.
 */
export async function emitAuditAnalytics(
  ctx: MutationCtx,
  event: AuditEventInput,
): Promise<void> {
  if (!env.POSTHOG_PROJECT_TOKEN) return;
  const captures = analyticsCapturesFor(event);
  if (captures.length === 0) return;

  const matchmaker =
    event.matchmakerId === undefined
      ? null
      : await ctx.db.get("matchmakers", event.matchmakerId);
  await ctx.scheduler.runAfter(0, internal.analytics.actions.capture, {
    captures,
    group: matchmaker?.username,
    timestamp: Date.now(),
  });
}
