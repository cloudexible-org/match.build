/**
 * What each agent is configured with, and whether it will run at all. Called
 * from `ai/queries.ts`, and from `admin/` when the settings page reads or
 * writes an agent.
 */

import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx } from "../_generated/server";
import {
  type AgentOffReason,
  AI_AGENT_LABELS,
  type AiAgentId,
  MAX_OUTPUT_TOKENS,
  offReasonFor,
} from "./rules";

/**
 * Whether this deployment can reach a model at all. Separate from any agent's
 * own switch: the Convex AI gateway is available on a paid Convex Cloud
 * deployment and nowhere else — not on a local backend, and not on the
 * anonymous backend the e2e suite runs against (`docs/e2e-architecture.md`
 * §1a). An agent can be configured and on, and still have nothing to call.
 *
 * Off is a supported state, not a broken one: every AI feature in phase 2
 * degrades to the phase-1 app (prd/phase-2.md, Principle).
 */
export function aiEnabled(): boolean {
  return env.AI_ENABLED === "true";
}

/** The stored row for an agent, or `null` when it has never been set up. */
export async function storedAgentSettings(
  ctx: QueryCtx,
  agent: AiAgentId,
): Promise<Doc<"aiAgentSettings"> | null> {
  return await ctx.db
    .query("aiAgentSettings")
    .withIndex("by_agent", (q) => q.eq("agent", agent))
    .unique();
}

export type AgentSettings = {
  agent: AiAgentId;
  label: string;
  does: string;
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxOutputTokens: number;
  /** Whether a row exists at all. */
  exists: boolean;
  /** Why it won't run, or `null` when it will. */
  offReason: AgentOffReason | null;
};

/**
 * An agent's configuration as stored, with no substitution of any kind. An
 * unconfigured agent comes back empty and off, which is the whole point: there
 * is no default for a reader of this code to have to know about.
 */
export async function agentSettings(
  ctx: QueryCtx,
  agent: AiAgentId,
): Promise<AgentSettings> {
  const stored = await storedAgentSettings(ctx, agent);
  const shape = {
    exists: stored !== null,
    enabled: stored?.enabled ?? false,
    model: stored?.model ?? "",
    systemPrompt: stored?.systemPrompt ?? "",
  };
  return {
    agent,
    ...AI_AGENT_LABELS[agent],
    ...shape,
    maxOutputTokens: MAX_OUTPUT_TOKENS[agent],
    offReason: offReasonFor(shape),
  };
}

/**
 * An agent ready to be called, or `null` when anything at all stands in the
 * way — not configured, switched off, missing a model or an instruction, or a
 * deployment with no gateway.
 *
 * Every feature that wants a model goes through this, so "is the AI on?" is one
 * question asked in one place rather than four conditions each caller has to
 * remember.
 */
export async function activeAgent(
  ctx: QueryCtx,
  agent: AiAgentId,
): Promise<AgentSettings | null> {
  if (!aiEnabled()) return null;
  const settings = await agentSettings(ctx, agent);
  return settings.offReason === null ? settings : null;
}
