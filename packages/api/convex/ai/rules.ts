/**
 * Which model does which job, and the ceilings around a call (prd/phase-2.md
 * §4, §6). Plain code with no Convex imports, exported through `@repo/api` so
 * a settings page can say what the deployment is configured to use.
 */

/**
 * Models are named the way the Convex AI gateway names them —
 * `<provider>/<model>` — not the way a provider's own SDK does. The gateway
 * holds the credentials, so there is no API key in this deployment and no
 * provider contract of our own: Convex is the sub-processor the DPA names
 * (prd/phase-2.md §7).
 */
export const DEFAULT_MODELS = {
  /**
   * Drafting replies in the matchmaker's voice (§4A). A draft a matchmaker
   * sends under their own name is not the place to save a tenth of a cent.
   */
  replies: "anthropic/claude-opus-5",
  /**
   * Pulling structured facts out of a message (§4B). High volume, short
   * inputs, a fixed output shape — what a small model is for.
   */
  extraction: "anthropic/claude-haiku-4-5",
} as const;

export type ModelJob = keyof typeof DEFAULT_MODELS;

/**
 * The gateway rejects an unknown model id, which is the failure a typo in a
 * deployment setting produces. Catching the shape here turns it into a refusal
 * we can explain instead of a provider error nobody reads.
 */
export function isModelId(value: string): boolean {
  return /^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/.test(value.trim());
}

/**
 * Resolves the model for a job, letting a deployment override the default
 * without a deploy (§6). An override that isn't a model id is ignored rather
 * than thrown on: a bad setting should degrade to the default, because every
 * AI feature in this phase is allowed to be absent but not to break the app.
 */
export function modelFor(job: ModelJob, override: string | undefined): string {
  const trimmed = override?.trim();
  return trimmed && isModelId(trimmed) ? trimmed : DEFAULT_MODELS[job];
}

/**
 * A single generation's ceiling. Not a budget — prd/phase-2.md §9.2 leaves the
 * per-matchmaker budget open, and it belongs to the rate limiter when it lands.
 */
export const MAX_OUTPUT_TOKENS = {
  replies: 1_024,
  extraction: 2_048,
} as const satisfies Record<ModelJob, number>;
