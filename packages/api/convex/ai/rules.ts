/**
 * The three agents (prd/phase-2.md §4.1) and what may be saved for one. Plain
 * code with no Convex imports, exported through `@repo/api` so the admin app
 * refuses exactly what the server would.
 *
 * **There are no defaults here, and no prompt text.** An agent's model and
 * standing instruction come from the database and nowhere else (§4.4): this
 * file cannot supply one, so there is no path by which an unconfigured agent
 * quietly runs on something a reader of this file wouldn't expect. The starting
 * models and instructions are seed data (`convex/seed/ai/fixture.ts`), which a
 * platform admin then owns.
 */

export const AI_AGENT_IDS = [
  "conversation",
  "candidate_profile",
  "voice_profile",
] as const;

export type AiAgentId = (typeof AI_AGENT_IDS)[number];

export function isAiAgentId(value: string): value is AiAgentId {
  return (AI_AGENT_IDS as readonly string[]).includes(value);
}

/** What each agent is called and does, for the settings page. */
export const AI_AGENT_LABELS: Record<
  AiAgentId,
  { label: string; does: string }
> = {
  conversation: {
    label: "Conversation",
    does: "Drafts replies, notices facts, and keeps the thread summary.",
  },
  candidate_profile: {
    label: "Candidate profile",
    does: "Adds, supersedes and discards facts on a candidate's profile.",
  },
  voice_profile: {
    label: "Voice profile",
    does: "Maintains the matchmaker's voice profile from their samples and sent messages.",
  },
};

/** A ceiling on one generation, not a budget (prd/phase-2.md §9.2). */
export const MAX_OUTPUT_TOKENS: Record<AiAgentId, number> = {
  conversation: 2_048,
  candidate_profile: 2_048,
  voice_profile: 2_048,
};

/**
 * Models are named the way the Convex AI gateway names them —
 * `<provider>/<model>` — not the way a provider's own SDK does. The gateway
 * holds the credentials, so there is no API key in this deployment and no
 * provider contract of our own (prd/phase-2.md §7).
 */
export function isModelId(value: string): boolean {
  return /^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(value.trim());
}

export const MODEL_ID_HINT =
  "A model is named as the gateway names it: a provider, a slash, then the model — for example anthropic/claude-opus-5.";

export const SYSTEM_PROMPT_MAX = 8_000;

/**
 * What may be saved as a model. **Empty is allowed and means off** — clearing
 * the field is how an agent is turned off without anyone having to remember a
 * magic value. A non-empty value has to look like a model the gateway could
 * accept, because the alternative is discovering the typo at generation time.
 */
export function modelError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isModelId(trimmed) ? null : MODEL_ID_HINT;
}

/** What may be saved as a standing instruction. Empty is allowed: it means off. */
export function systemPromptError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > SYSTEM_PROMPT_MAX) {
    return `An instruction is at most ${SYSTEM_PROMPT_MAX.toLocaleString()} characters; this one is ${trimmed.length.toLocaleString()}.`;
  }
  return null;
}

/**
 * Why an agent is off, or `null` when it will run. Three ways to be off, and a
 * page that says "off" without saying which is a page that wastes someone's
 * afternoon.
 */
export type AgentOffReason =
  | "unconfigured"
  | "disabled"
  | "no_model"
  | "no_instruction";

export function offReasonFor(settings: {
  exists: boolean;
  enabled: boolean;
  model: string;
  systemPrompt: string;
}): AgentOffReason | null {
  if (!settings.exists) return "unconfigured";
  if (!settings.enabled) return "disabled";
  if (!settings.model.trim()) return "no_model";
  if (!settings.systemPrompt.trim()) return "no_instruction";
  return null;
}

export const OFF_REASON_TEXT: Record<AgentOffReason, string> = {
  unconfigured: "Never set up on this deployment.",
  disabled: "Turned off here.",
  no_model: "No model, so there is nothing to call.",
  no_instruction: "No standing instruction, so there is nothing to tell it.",
};
