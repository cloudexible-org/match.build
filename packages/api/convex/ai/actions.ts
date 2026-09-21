"use node";

/*
 * Every call that leaves Convex for a model (prd/phase-2.md §4). Node runtime,
 * because that is what `@convex-dev/ai-sdk-provider` documents; and actions
 * only, so nothing here shares a file with a query or mutation (`CLAUDE.md` §8).
 *
 * There is no API key in this file or in this deployment. `convexGateway` mints
 * a short-lived deployment token per action and calls the Convex AI gateway,
 * which holds the provider credentials (prd/phase-2.md §7).
 */

import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { generateText } from "ai";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { aiEnabled, modelForJob } from "./helpers";
import { MAX_OUTPUT_TOKENS } from "./rules";

/**
 * One generation, with nothing of the product in it: no candidate, no
 * conversation, no thread. It exists to answer "can this deployment reach a
 * model, and which one does it get?" — the question every feature in phase 2
 * assumes a yes to, and the only one that can't be answered from a unit test.
 *
 * Internal, so it is reachable from the dashboard and from a test and from
 * nowhere a candidate's browser can go.
 */
export const probe = internalAction({
  args: {
    prompt: v.optional(v.string()),
    job: v.optional(v.union(v.literal("replies"), v.literal("extraction"))),
  },
  returns: v.object({
    ok: v.boolean(),
    model: v.string(),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (_ctx, { prompt, job }) => {
    const which = job ?? "replies";
    const model = modelForJob(which);

    // Off is a state, not a failure: a local or e2e backend has no gateway.
    if (!aiEnabled()) {
      return { ok: false, model, error: 'AI_ENABLED is not "true".' };
    }

    try {
      const { text } = await generateText({
        model: convexGateway(model),
        maxOutputTokens: MAX_OUTPUT_TOKENS[which],
        prompt:
          prompt ??
          "Reply with the single word READY and no punctuation or explanation.",
      });
      return { ok: true, model, text };
    } catch (error) {
      // Returned rather than thrown: the caller wants to know *which* model was
      // asked and what the gateway said, and a thrown error in an action is a
      // stack trace in the logs instead of an answer.
      return {
        ok: false,
        model,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
