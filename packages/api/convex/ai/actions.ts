/*
 * Every call that leaves Convex for a model (prd/phase-2.md §4).
 *
 * **Deliberately not `"use node"`**, though the provider's README uses it. The
 * gateway is reached over `fetch`, which Convex's own runtime has, and the cost
 * of a Node action here is not a cold start — it is the e2e suite: a local
 * anonymous backend cannot run Node actions at all, so one `"use node"` file
 * fails the *whole* push with `DeploymentNotConfiguredForNodeActions` and every
 * spec then runs against stale functions (`AGENTS.md` §8). Actions only all the
 * same, so nothing here shares a file with a query or mutation.
 */

import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { recordUsage } from "../aiUsage/helpers";
import type { AgentSettings } from "./helpers";
import { type AiAgentId, OFF_REASON_TEXT } from "./rules";

const agentId = v.union(
  v.literal("conversation"),
  v.literal("candidate_profile"),
  v.literal("voice_profile"),
);

/**
 * Annotated rather than inferred: the handler calls a query through `internal`,
 * which includes this action, and TypeScript cannot unwind that circle on its
 * own (TS7022).
 */
type ProbeResult = {
  ok: boolean;
  agent: AiAgentId;
  model: string;
  text?: string;
  error?: string;
};

/**
 * One generation, with nothing of the product in it: no candidate, no
 * conversation, no thread. It answers "will this agent actually run, and can
 * this deployment reach the model it is set to?" — the question every feature in
 * phase 2 assumes a yes to, and the only one that can't be answered from a unit
 * test.
 *
 * It runs the agent's real stored instruction, so an instruction saved on the
 * settings page that the gateway rejects is caught here rather than on a
 * candidate's first message.
 *
 * Internal, so it is reachable from the dashboard and from a script and from
 * nowhere a candidate's browser can go.
 */
export const probe = internalAction({
  args: { agent: agentId, prompt: v.optional(v.string()) },
  returns: v.object({
    ok: v.boolean(),
    agent: agentId,
    model: v.string(),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { agent, prompt }): Promise<ProbeResult> => {
    const settings: AgentSettings | null = await ctx.runQuery(
      internal.ai.queries.active,
      { agent },
    );

    // Off is a state, not a failure — and the reason matters, because "off"
    // without a reason is the thing that wastes an afternoon.
    if (settings === null) {
      const stored: AgentSettings = await ctx.runQuery(
        internal.ai.queries.settings,
        { agent },
      );
      return {
        ok: false,
        agent,
        model: stored.model,
        error:
          stored.offReason === null
            ? 'AI_ENABLED is not "true" on this deployment.'
            : OFF_REASON_TEXT[stored.offReason],
      };
    }

    try {
      const { text, usage } = await generateText({
        model: convexGateway(settings.model),
        maxOutputTokens: settings.maxOutputTokens,
        system: settings.systemPrompt,
        prompt:
          prompt ??
          "Ignore your usual work for one message and reply with the single word READY, with no punctuation or explanation.",
      });
      // A probe is a real generation and shows up on the usage page as one, with
      // no matchmaker behind it — `ai:setup` runs it for every agent on every
      // deployment, so a setup run that costs something should be visible rather
      // than folded into somebody's book.
      await recordUsage(ctx, { agent, model: settings.model, usage });
      return { ok: true, agent, model: settings.model, text };
    } catch (error) {
      // Returned rather than thrown: the caller wants to know *which* model was
      // asked and what the gateway said, and a thrown error in an action is a
      // stack trace in the logs instead of an answer.
      return {
        ok: false,
        agent,
        model: settings.model,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
