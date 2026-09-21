/**
 * How an action finds out what an agent is configured with. Internal only: an
 * agent's standing instruction is not something a candidate's browser asks for,
 * and the admin app reads it through `admin/queries.ts` instead.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { activeAgent, agentSettings } from "./helpers";
import { AI_AGENT_IDS } from "./rules";

const agentId = v.union(
  v.literal("conversation"),
  v.literal("candidate_profile"),
  v.literal("voice_profile"),
);

const settingsShape = {
  agent: agentId,
  label: v.string(),
  does: v.string(),
  enabled: v.boolean(),
  model: v.string(),
  systemPrompt: v.string(),
  maxOutputTokens: v.number(),
  exists: v.boolean(),
  offReason: v.union(
    v.literal("unconfigured"),
    v.literal("disabled"),
    v.literal("no_model"),
    v.literal("no_instruction"),
    v.null(),
  ),
};

/** One agent as stored, whether or not it will run. */
export const settings = internalQuery({
  args: { agent: agentId },
  returns: v.object(settingsShape),
  handler: async (ctx, { agent }) => await agentSettings(ctx, agent),
});

/**
 * One agent, only if it will actually run. `null` covers every way of being
 * off, so a caller has one thing to check rather than four.
 */
export const active = internalQuery({
  args: { agent: agentId },
  returns: v.union(v.object(settingsShape), v.null()),
  handler: async (ctx, { agent }) => await activeAgent(ctx, agent),
});

/** Every agent id, for the setup script. */
export const allAgents = internalQuery({
  args: {},
  returns: v.array(agentId),
  handler: async () => [...AI_AGENT_IDS],
});
