/**
 * Picks free TCP ports for the suite's servers. The one allocator both
 * `free-port.ts` (which runs it as a child process, because the Playwright
 * config cannot `await`) and `convex-local.mjs` use.
 *
 * ─── Why not `listen(0)` ────────────────────────────────────────────────────
 *
 * Port 0 asks the OS for an *ephemeral* port — the same range (49152–65535 on
 * macOS, 32768–60999 on Linux) it draws from for every outgoing connection.
 * Probing a port and releasing it so the real server can bind leaves a gap,
 * and with several worktrees' suites running at once, each with a browser, a
 * Convex websocket and dev-server HMR, the OS fills that gap with someone's
 * outgoing socket. Observed: `next dev` failing with EADDRINUSE on a port the
 * allocator had just handed out.
 *
 * Ports in PORT_RANGE are below every OS's ephemeral range, so the OS never
 * assigns them on its own. Only another explicit bind can take one, and for
 * that a sibling run would have to draw the same random port in the same
 * millisecond.
 *
 * Each candidate is bound on both 127.0.0.1 and ::, because servers differ in
 * which they listen on and either being taken means the port is taken.
 */

import net from "node:net";

const PORT_RANGE = { min: 20_000, max: 32_000 };

function tryListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) =>
      // No IPv6 on this machine: nothing can collide there either.
      resolve(
        error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"
          ? "skip"
          : null,
      ),
    );
    server.listen({ port, host, ipv6Only: host === "::" }, () =>
      resolve(server),
    );
  });
}

function close(servers) {
  return Promise.all(
    servers
      .filter((server) => typeof server === "object" && server !== null)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
}

/** `count` distinct free ports; all are held until every one is decided. */
export async function pickFreePorts(count) {
  const held = [];
  const ports = [];
  try {
    for (let attempt = 0; ports.length < count; attempt++) {
      if (attempt > 500)
        throw new Error(
          `No free ports in ${PORT_RANGE.min}-${PORT_RANGE.max}.`,
        );
      const port =
        PORT_RANGE.min +
        Math.floor(Math.random() * (PORT_RANGE.max - PORT_RANGE.min));
      if (ports.includes(port)) continue;

      const v4 = await tryListen(port, "127.0.0.1");
      if (!v4) continue;
      const v6 = await tryListen(port, "::");
      if (!v6) {
        await close([v4]);
        continue;
      }
      held.push(v4, v6);
      ports.push(port);
    }
    return ports;
  } finally {
    await close(held);
  }
}

// `node pick-ports.mjs <count>` prints the ports as JSON.
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const count = Number(process.argv[2] ?? 1);
  process.stdout.write(JSON.stringify(await pickFreePorts(count)));
}
