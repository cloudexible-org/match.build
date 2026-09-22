/**
 * `pnpm dev:ports` — every dev server on a port of its own, no portless.
 *
 * `pnpm dev` is the one to run by hand: portless puts the three apps behind
 * one origin, `https://matchbuild.localhost`, with the app at `/app/` and the
 * admin app at `/admin/`, exactly as production serves them. That shape costs
 * a trusted local CA, a proxy on port 443 and a hostname per app — none of
 * which an agent driving the app over HTTP can rely on, and the first of which
 * it cannot install unattended.
 *
 * This is the other door. It asks the OS for three free ports, starts each app
 * directly on one, and prints where they are. Nothing proxies to anything:
 * `/app/` exists only on the app server and `/admin/` only on the admin
 * server, because `PORTLESS_URL` is unset and `apps/app/vite.config.ts` turns
 * its proxy off without it. That is the same arrangement the Playwright suite
 * runs in (`tooling/harness/playwright.config.ts`), for the same reason.
 *
 * Ports are drawn fresh every run from a range below every OS's ephemeral
 * range, so any number of these can run at once — next to each other, next to
 * `pnpm dev`, and next to a test run — without contending for anything. Pin
 * one with `DEV_APP_PORT` / `DEV_ADMIN_PORT` / `DEV_WWW_PORT` when you need a
 * URL to stay put across restarts.
 *
 *   DEV_PORTS_FILE=<path>  also write the ports to that file as JSON, for a
 *                          caller that would rather read a file than scrape
 *                          this output
 *   DEV_CONVEX=0           skip `convex dev` (the apps then talk to whatever
 *                          VITE_CONVEX_URL says, without a watcher)
 *   DEV_DOPPLER=0          run the servers bare, for a machine with no Doppler
 *                          access
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pickFreePorts } from "../tooling/harness/scripts/pick-ports.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Loopback only. These servers are for this machine, not for the network. */
const HOST = "127.0.0.1";

/**
 * A distDir of this mode's own. Next 16 keeps its dev lock at `<distDir>/lock`,
 * so a `next dev` sharing `.next` with a running `pnpm dev` refuses to start —
 * a different port does not help, because the lock is on the directory. Same
 * reasoning as the suite's `.next-e2e`; see `apps/www/next.config.ts`.
 */
const WWW_DIST_DIR = ".next-ports";

/**
 * `doppler run` with the project and config spelled out, rather than the
 * `doppler.yaml` binding the `dev` scripts rely on: that binds by *absolute
 * path*, so a fresh clone or a git worktree that has never run `doppler setup`
 * would otherwise fail — or, worse, resolve some other directory's binding.
 * Mirrors `tooling/harness/doppler.ts`.
 */
const DOPPLER_PROJECT = "matchbuild";

const dopplerEnabled = process.env.DEV_DOPPLER !== "0";

function withDoppler(app, command) {
  if (!dopplerEnabled) return command;
  return [
    "doppler",
    "run",
    "--project",
    DOPPLER_PROJECT,
    "--config",
    `dev_${app}`,
    "--",
    ...command,
  ];
}

/** Repo-relative when it is inside the repo, absolute when it is not. */
function displayPath(file) {
  const relative = path.relative(ROOT, file);
  return relative.startsWith("..") ? file : relative;
}

/** A pinned port from the environment, or `null` to draw a free one. */
function pinned(name) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function resolvePorts() {
  const names = ["DEV_WWW_PORT", "DEV_APP_PORT", "DEV_ADMIN_PORT"];
  const pins = names.map(pinned);
  const drawn = await pickFreePorts(
    pins.filter((port) => port === null).length,
  );
  return pins.map((port) => port ?? drawn.shift());
}

const children = [];
let shuttingDown = false;
/** Set below, once the ports are known. Removed again on the way out. */
let portsFile = null;

/**
 * Each child gets its own process group, so teardown can take its descendants
 * with it. A dev server that outlives the run holds its port and its Next
 * lock, and the next run then fails on a port it was told was free.
 */
function start(label, command, cwd, env) {
  const childEnv = { ...process.env, ...env };
  // Structural, not circumstantial: `apps/app/vite.config.ts` keys its
  // one-origin proxy on PORTLESS_URL, so a stray one inherited from a shell
  // that has been through portless would point this app's front door at
  // hostnames nothing here is serving.
  delete childEnv.PORTLESS_URL;

  const child = spawn(command[0], command.slice(1), {
    cwd: path.join(ROOT, cwd),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  const prefix = `[${label}]`;
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = "";
    stream.setEncoding("utf-8");
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      // The tail is whatever came after the last newline: a partial line, kept
      // until the rest of it arrives.
      buffered = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`${prefix} ${line}\n`);
    });
  }

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `\n${prefix} exited ${signal ? `on ${signal}` : `with code ${code}`}; stopping the rest.`,
    );
    shutdown(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(`${prefix} could not start: ${error.message}`);
    if (!shuttingDown) shutdown(1);
  });

  children.push(child);
  return child;
}

function signal(child, name) {
  try {
    if (child.pid === undefined || child.exitCode !== null) return;
    // Negative pid: the whole process group, so `pnpm exec` and the server it
    // spawned both get it.
    if (process.platform === "win32") child.kill(name);
    else process.kill(-child.pid, name);
  } catch {
    // Already gone.
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (portsFile) fs.rmSync(portsFile, { force: true });
  for (const child of children) signal(child, "SIGTERM");
  const grace = setTimeout(() => {
    for (const child of children) signal(child, "SIGKILL");
    process.exit(code);
  }, 5_000);
  grace.unref();
  const done = setInterval(() => {
    if (children.every((child) => child.exitCode !== null)) {
      clearInterval(done);
      process.exit(code);
    }
  }, 100);
}

const [wwwPort, appPort, adminPort] = await resolvePorts();

const urls = {
  www: `http://${HOST}:${wwwPort}/`,
  app: `http://${HOST}:${appPort}/app/`,
  admin: `http://${HOST}:${adminPort}/admin/`,
};

portsFile = process.env.DEV_PORTS_FILE
  ? path.resolve(ROOT, process.env.DEV_PORTS_FILE)
  : null;
if (portsFile) {
  fs.mkdirSync(path.dirname(portsFile), { recursive: true });
  fs.writeFileSync(
    portsFile,
    // `pid` is here because this file is removed on a clean exit but survives a
    // SIGKILL: a reader that finds one can check whether anything still owns it.
    `${JSON.stringify({ pid: process.pid, host: HOST, ports: { www: wwwPort, app: appPort, admin: adminPort }, urls }, null, 2)}\n`,
  );
}

console.log(`
  dev:ports — no portless, no proxy. Each app answers only for itself.

    www    ${urls.www}
    app    ${urls.app}
    admin  ${urls.admin}
${portsFile ? `\n  Ports written to ${displayPath(portsFile)}.\n` : ""}
  The marketing site's links to /app/ point at the www server, where they 404 —
  that one origin is what \`pnpm dev\` is for. Ctrl-C stops everything.
`);

start(
  "www",
  withDoppler("www", [
    "pnpm",
    "exec",
    "next",
    "dev",
    "--port",
    String(wwwPort),
    "--hostname",
    HOST,
  ]),
  "apps/www",
  { NEXT_DIST_DIR: WWW_DIST_DIR },
);

start(
  "app",
  withDoppler("app", [
    "pnpm",
    "exec",
    "vite",
    "--port",
    String(appPort),
    "--strictPort",
    "--host",
    HOST,
  ]),
  "apps/app",
  {},
);

start(
  "admin",
  withDoppler("admin", [
    "pnpm",
    "exec",
    "vite",
    "--port",
    String(adminPort),
    "--strictPort",
    "--host",
    HOST,
  ]),
  "apps/admin",
  {},
);

if (process.env.DEV_CONVEX !== "0") {
  // No Doppler here: `packages/api` is not in `doppler.yaml`, and the Convex
  // CLI reads its deployment from `packages/api/.env.local`.
  start("convex", ["pnpm", "exec", "convex", "dev"], "packages/api", {});
}

for (const name of ["SIGINT", "SIGTERM"]) {
  process.on(name, () => shutdown(0));
}
