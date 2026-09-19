/**
 * Runs this project's **local** Convex backend and keeps it alive, watching for
 * code changes — the backend the e2e suite talks to.
 *
 *   pnpm --filter e2e convex:local
 *
 * Playwright starts this as a `webServer`, so you rarely run it yourself; do it
 * when you want to poke at the seeded data in a browser without running tests.
 *
 * ─── Why a wrapper and not just `npx convex dev` ────────────────────────────
 *
 * Three environment overrides, none of which `convex dev` can be told on the
 * command line:
 *
 *   CONVEX_AGENT_MODE=anonymous  provisions a local deployment with no Convex
 *                                account, so anyone who clones this template
 *                                can run the suite. `--env-file` cannot express
 *                                this: it insists on naming a deployment.
 *   CONVEX_DEPLOYMENT=""         the CLI otherwise resolves this from
 *                                packages/api/.env.local *first* and cannot
 *                                authorize it once the deploy key below is
 *                                cleared, so it fails before ever considering
 *                                a local deployment.
 *   CONVEX_DEPLOY_KEY=""         a deploy key pins the CLI to the cloud
 *                                deployment it was minted for, and every local
 *                                operation fails while it is set.
 *
 * The last two are one fact, not two: the deploy key is what grants access to
 * the cloud deployment named in .env.local, and the logged-in CLI account does
 * not otherwise have it. Clearing the key therefore forces clearing the
 * deployment as well. Verified 2026-08-07 — `npx convex data` lists tables with
 * the key present and reports "You don't have access to the selected project"
 * without it. The management API answers 404 in that state, which looks exactly
 * like a deleted deployment and is not one: it is live, and is the deployment
 * `pnpm dev` runs against.
 *
 * And one thing the CLI does that has to be undone — see the watcher below.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { pickFreePorts } from "./pick-ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, "..", "..", "..", "packages", "api");
const DEV_ENV_FILE = path.join(BACKEND_DIR, ".env.local");

/**
 * Configuring a local deployment rewrites `CONVEX_DEPLOYMENT` in
 * `packages/api/.env.local` to the local one and injects `CONVEX_URL` /
 * `CONVEX_SITE_URL`. That silently repoints an ordinary `pnpm dev` at the
 * disposable e2e backend; the file is gitignored, so nothing flags it, and the
 * failure it causes later — a dev app talking to an empty database — looks
 * entirely unrelated.
 *
 * Observed on 2026-08-07 while building this harness, not assumed: running
 * `convex dev` directly changed the file's checksum.
 *
 * Restoring only on exit would leave it wrong for the whole run, which is
 * exactly when someone might restart `pnpm dev` and pick up the bad value. The
 * CLI writes once, at configure time, so this fires about once per start.
 */
const devEnvBefore = fs.existsSync(DEV_ENV_FILE)
  ? fs.readFileSync(DEV_ENV_FILE, "utf-8")
  : null;

/**
 * True when the file has been repointed at a *local* backend — the specific
 * damage this watcher exists to undo.
 *
 * Deliberately narrow. A blanket "restore whenever it differs" would also
 * revert a legitimate concurrent write, and a concurrent write is now expected:
 * the whole point of the port and distDir work is that `pnpm dev` can be
 * running, and its own `convex dev` owns this file.
 */
function repointedAtLocalBackend(content) {
  return (
    /^CONVEX_DEPLOYMENT=(local:|anonymous)/m.test(content) ||
    /^CONVEX_URL=https?:\/\/(127\.0\.0\.1|localhost)/m.test(content)
  );
}

function restoreDevEnv() {
  try {
    if (devEnvBefore === null) {
      // Nothing there before: only remove a file that is ours.
      if (
        fs.existsSync(DEV_ENV_FILE) &&
        repointedAtLocalBackend(fs.readFileSync(DEV_ENV_FILE, "utf-8"))
      ) {
        fs.unlinkSync(DEV_ENV_FILE);
      }
      return;
    }
    const now = fs.readFileSync(DEV_ENV_FILE, "utf-8");
    if (now !== devEnvBefore && repointedAtLocalBackend(now)) {
      fs.writeFileSync(DEV_ENV_FILE, devEnvBefore);
      console.log(
        "↩︎  restored packages/api/.env.local (convex dev repointed it at the local backend)",
      );
    }
  } catch {
    // Best effort — never mask the child's own exit reason.
  }
}

// ─── One backend per worktree, on this run's ports ─────────────────────────
//
// Several git worktrees can run the suite at once. Each worktree's deployment
// (and its SQLite database) lives in its own `packages/api/.convex/local/`, so
// data never mixes — but ports and process lifetimes are shared machine-wide.
// See §1c of docs/e2e-architecture.md.

const LOCAL_CONFIG = path.join(
  BACKEND_DIR,
  ".convex",
  "local",
  "default",
  "config.json",
);
const LOCK_FILE = path.join(BACKEND_DIR, ".convex", "e2e-backend.lock");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/**
 * True when *this worktree's* deployment answers at `port`: its own admin key
 * is accepted for its own internal `ping`. A sibling worktree's backend has the
 * same name but a different key, so it fails this.
 */
async function isOurBackend(port, adminKey) {
  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const client = new ConvexHttpClient(`http://127.0.0.1:${port}`);
    client.setAdminAuth(adminKey);
    const pong = await Promise.race([
      client.query("seed/e2e/mutations:ping", {}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2_000),
      ),
    ]);
    return pong === "matchmaker-e2e";
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/**
 * Exclusive per-worktree lock. A second backend on the same database file
 * would corrupt it, and a second suite would reseed (wipe) it mid-run, so a
 * concurrent run in the same worktree must fail loudly instead.
 */
async function acquireLock(port) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, port }), {
        flag: "wx",
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    const holder = readJson(LOCK_FILE);
    if (holder && isAlive(holder.pid)) {
      fail(
        `This worktree's e2e backend is already running (pid ${holder.pid}, ` +
          `port ${holder.port}) — another \`pnpm test:e2e\` or ` +
          "`convex:local` in this same checkout. Only one can own its database " +
          "at a time; wait for it or stop it. Other worktrees are unaffected.",
      );
    }

    // The holder died without cleaning up. Its backend normally died with it
    // (Playwright kills the whole process group), but make sure: two backends
    // on one SQLite file is the one thing this must never allow.
    const config = readJson(LOCAL_CONFIG);
    if (
      holder?.port &&
      config &&
      (await isOurBackend(holder.port, config.adminKey))
    ) {
      fail(
        `An orphaned e2e backend for this worktree is still serving port ` +
          `${holder.port}. Stop it (\`lsof -ti tcp:${holder.port} | xargs kill\`) ` +
          "and re-run.",
      );
    }
    fs.rmSync(LOCK_FILE, { force: true });
  }
  fail(`Could not acquire ${LOCK_FILE}.`);
}

function releaseLock() {
  if (readJson(LOCK_FILE)?.pid === process.pid) {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

const [cloudPort, sitePort] =
  process.env.E2E_CONVEX_PORT && process.env.E2E_CONVEX_SITE_PORT
    ? [
        Number(process.env.E2E_CONVEX_PORT),
        Number(process.env.E2E_CONVEX_SITE_PORT),
      ]
    : await pickFreePorts(2);

await acquireLock(cloudPort);
process.on("exit", releaseLock);

// Point the recorded pair at this run's ports before the CLI reads it. On
// start the CLI first waits for a backend on the *recorded* port to stop, and
// since every worktree's deployment is named `anonymous-agent` it cannot tell a
// sibling's backend there from its own — so it waits, then refuses to start.
// Safe to rewrite: the lock above means none of ours is running.
const config = readJson(LOCAL_CONFIG);
if (config) {
  config.ports = { cloud: cloudPort, site: sitePort };
  fs.writeFileSync(LOCAL_CONFIG, JSON.stringify(config));
}

console.log(`Convex e2e backend → http://127.0.0.1:${cloudPort}`);

fs.watchFile(DEV_ENV_FILE, { interval: 500 }, restoreDevEnv);

const child = spawn(
  "npx",
  [
    "convex",
    "dev",
    "--typecheck",
    "disable",
    // Codegen writes packages/api/convex/_generated/. A developer's own
    // `convex dev` owns those files, and two processes regenerating them
    // concurrently churns the working tree for no benefit — the suite reaches
    // its functions by string name and never imports the generated API.
    "--codegen",
    "disable",
    "--tail-logs",
    "disable",
    // Hidden CLI flags; the CLI exits if either is taken rather than drifting
    // to another port the harness does not know about.
    "--local-cloud-port",
    String(cloudPort),
    "--local-site-port",
    String(sitePort),
  ],
  {
    cwd: BACKEND_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      CONVEX_AGENT_MODE: "anonymous",
      CONVEX_DEPLOYMENT: "",
      CONVEX_DEPLOY_KEY: "",
    },
  },
);

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", () => {
  fs.unwatchFile(DEV_ENV_FILE, restoreDevEnv);
  restoreDevEnv();
});
child.on("exit", (code) => {
  fs.unwatchFile(DEV_ENV_FILE, restoreDevEnv);
  restoreDevEnv();
  process.exit(code ?? 0);
});
