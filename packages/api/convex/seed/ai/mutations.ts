/**
 * Puts the starting models and instructions into `aiAgentSettings`
 * (prd/phase-2.md §4.4). Run with `pnpm --filter @repo/api ai:setup`.
 *
 * Unlike `seed/dev` and `seed/e2e`, this seed is meant for a **real**
 * deployment: it is how a production deployment gets its agents in the first
 * place, since nothing in the code supplies one. It therefore wipes nothing and
 * is safe to run against prod.
 *
 * Idempotent: an agent that already has a row is left exactly as it is, so a
 * second run cannot undo a platform admin's work. `force` overwrites, for
 * putting an agent back to where it started.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { storedAgentSettings } from "../../ai/helpers";
import { AI_AGENT_SEED } from "./fixture";

export const apply = internalMutation({
  args: { force: v.optional(v.boolean()) },
  returns: v.object({
    created: v.array(v.string()),
    overwritten: v.array(v.string()),
    kept: v.array(v.string()),
  }),
  handler: async (ctx, { force }) => {
    const created: string[] = [];
    const overwritten: string[] = [];
    const kept: string[] = [];

    for (const seed of AI_AGENT_SEED) {
      const existing = await storedAgentSettings(ctx, seed.agent);
      if (existing === null) {
        await ctx.db.insert("aiAgentSettings", {
          agent: seed.agent,
          enabled: seed.enabled,
          model: seed.model,
          systemPrompt: seed.systemPrompt,
          updatedAt: Date.now(),
          // No `updatedByUserId`: nobody decided this, the seed did. The
          // settings page says "seeded" rather than naming an admin who didn't.
        });
        created.push(seed.agent);
      } else if (force === true) {
        await ctx.db.patch("aiAgentSettings", existing._id, {
          enabled: seed.enabled,
          model: seed.model,
          systemPrompt: seed.systemPrompt,
          updatedAt: Date.now(),
          updatedByUserId: undefined,
        });
        overwritten.push(seed.agent);
      } else {
        kept.push(seed.agent);
      }
    }
    return { created, overwritten, kept };
  },
});
