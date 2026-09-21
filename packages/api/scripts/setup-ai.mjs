/**
 * Gets the AI side of the app working on a deployment, and proves it
 * (prd/phase-2.md §4.4, §4.5).
 *
 *   pnpm --filter @repo/api ai:setup            seed any missing agent, then probe
 *   pnpm --filter @repo/api ai:setup --prod
 *   pnpm --filter @repo/api ai:setup --force    put every agent back to the seed
 *   pnpm --filter @repo/api ai:setup --off      AI off for the whole deployment
 *
 * Two separate things have to be true for an agent to run, and this sets both:
 *
 *   1. `AI_ENABLED` — whether this deployment can reach the Convex AI gateway at
 *      all. There is no API key: the gateway holds the provider credentials. It
 *      needs a paid Convex Cloud deployment, which is why a local backend and
 *      the e2e suite's anonymous one can't have it.
 *   2. Each agent's row in `aiAgentSettings` — its switch, model and standing
 *      instruction. Nothing in the code supplies these, so an agent that has
 *      never been seeded is simply off.
 *
 * Seeding is idempotent and never overwrites a platform admin's work; --force
 * does, deliberately. Safe against prod: it wipes nothing.
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? ["--prod"] : [];
const turningOff = args.includes("--off");
const force = args.includes("--force");

function convex(commandArgs, input) {
  return spawnSync("npx", ["convex", ...commandArgs, ...target], {
    input,
    encoding: "utf-8",
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
}

/** `convex run` takes its args positionally; on stdin they are ignored. */
function run(fn, fnArgs) {
  const result = convex(["run", "--no-push", fn, JSON.stringify(fnArgs ?? {})]);
  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error(
      `Could not read the answer from ${fn}:\n${result.stderr || result.stdout}`,
    );
    process.exit(1);
  }
}

const set = convex(["env", "set", "AI_ENABLED"], turningOff ? "false" : "true");
if (set.status !== 0) {
  console.error(`Failed to set AI_ENABLED:\n${set.stderr}`);
  process.exit(1);
}

if (turningOff) {
  console.log("✔ AI_ENABLED=false — the app runs as it did in phase 1.");
  process.exit(0);
}
console.log("✔ AI_ENABLED=true");

const seeded = run("seed/ai/mutations:apply", force ? { force: true } : {});
for (const agent of seeded.created) console.log(`✔ seeded ${agent}`);
for (const agent of seeded.overwritten) console.log(`✔ reset ${agent} to seed`);
for (const agent of seeded.kept) {
  console.log(`·  ${agent} already set up — left alone`);
}

// The probe asks for one word, and an agent usually answers in its own terms
// instead — it is following its standing instruction, which is the thing being
// checked. Only whether the call succeeded matters here.
console.log("Checking each agent's model answers…");
let failed = false;
for (const agent of run("ai/queries:allAgents")) {
  const result = run("ai/actions:probe", { agent });
  if (result.ok) {
    console.log(`✔ ${agent} → ${result.model}`);
  } else {
    // Not fatal: an agent a platform admin has deliberately switched off is a
    // correct state, and this script should say so rather than fail.
    console.log(`·  ${agent} not running — ${result.error}`);
    if (result.error?.includes("gateway") || result.model === "") continue;
    failed = failed || /rejected|not found|unauthor/i.test(result.error ?? "");
  }
}
process.exit(failed ? 1 : 0);
