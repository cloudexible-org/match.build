/**
 * Turns the AI side of the app on for a deployment and proves it works
 * (prd/phase-2.md §4, convex/ai/).
 *
 *   pnpm --filter @repo/api ai:setup
 *   pnpm --filter @repo/api ai:setup --prod
 *   pnpm --filter @repo/api ai:setup --off
 *
 * Unlike the other setup scripts there is no secret to generate: model calls go
 * through the Convex AI gateway, which holds the provider credentials, so this
 * deployment never sees an API key. All this does is set AI_ENABLED and then
 * actually call a model, because a flag that says "on" while the gateway
 * refuses us is the one state worse than off.
 *
 * The gateway needs a paid Convex Cloud deployment. A local backend and the
 * e2e suite's anonymous one can't reach it, which is why AI_ENABLED exists at
 * all rather than the code assuming a model is always there.
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? ["--prod"] : [];
const turningOff = args.includes("--off");

function convex(commandArgs, input) {
  return spawnSync("npx", ["convex", ...commandArgs, ...target], {
    input,
    encoding: "utf-8",
    stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
  });
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

console.log("✔ AI_ENABLED=true. Asking the gateway for a word…");

for (const job of ["replies", "extraction"]) {
  // `convex run` takes its args as a positional argument; passing them on
  // stdin is silently ignored, and every probe then runs the default job.
  const probe = convex([
    "run",
    "--no-push",
    "ai/actions:probe",
    JSON.stringify({ job }),
  ]);
  let result;
  try {
    result = JSON.parse(probe.stdout);
  } catch {
    console.error(
      `Could not read the probe's answer for "${job}":\n${probe.stderr || probe.stdout}`,
    );
    process.exit(1);
  }
  if (!result.ok) {
    console.error(`✖ ${job} (${result.model}): ${result.error}`);
    process.exit(1);
  }
  console.log(`✔ ${job} → ${result.model}`);
}
