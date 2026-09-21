/**
 * Whether this deployment can talk to a model at all, and which one for which
 * job. Called from `ai/actions.ts` and, later, from the suggester and extractor.
 */

import { env } from "../_generated/server";
import { type ModelJob, modelFor } from "./rules";

/**
 * The Convex AI gateway is available on a paid Convex Cloud deployment and
 * nowhere else — not on a local backend, and not on the anonymous backend the
 * e2e suite runs against (`docs/e2e-architecture.md` §1a). `AI_ENABLED` is the
 * switch that says so, rather than letting a generation fail at the gateway and
 * be mistaken for a bad prompt.
 *
 * Off is a supported state, not a broken one: every AI feature in phase 2
 * degrades to the phase-1 app (prd/phase-2.md, Principle).
 */
export function aiEnabled(): boolean {
  return env.AI_ENABLED === "true";
}

/** The model this deployment uses for a job (prd/phase-2.md §6). */
export function modelForJob(job: ModelJob): string {
  const override =
    job === "replies" ? env.AI_MODEL_REPLIES : env.AI_MODEL_EXTRACTION;
  return modelFor(job, override);
}
