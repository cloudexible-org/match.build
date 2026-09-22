import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Must match the `pathPrefix` for `components.app` in convex/http.ts. */
const APP_BASE_PATH = "/app/";

/**
 * The portless app name this server registers under (see `apps/app`'s `dev`
 * script), and the stem every sibling's name is built on: `www.matchbuild`,
 * `admin.matchbuild`, `storybook.matchbuild`.
 */
const PORTLESS_BASE_NAME = "matchbuild";

/**
 * A sibling app's portless origin, derived from our own rather than hardcoded.
 *
 * Portless builds a hostname as `<name>.<tld>` and, in a **linked git
 * worktree**, prepends the branch as one more label — so this server is
 * `https://matchbuild.localhost` in the main checkout and
 * `https://<branch>.matchbuild.localhost` in a worktree. The sibling's label
 * belongs after that prefix and before the base name in both cases, which is
 * exactly where this inserts it. That is what lets two worktrees each run
 * `pnpm dev`: the front door of one can no longer proxy into the Next server
 * of the other. The TLD and any non-default proxy port ride along in
 * `PORTLESS_URL`, so a `--tld test` or `-p 1355` proxy is followed too.
 *
 * Only ever called when `PORTLESS_URL` is set, i.e. under portless.
 */
function portlessSibling(label: string): string {
  const url = new URL(process.env.PORTLESS_URL as string);
  url.hostname = url.hostname.replace(
    `${PORTLESS_BASE_NAME}.`,
    `${label}.${PORTLESS_BASE_NAME}.`,
  );
  return url.origin;
}

/**
 * Vite answers the bare base path (`/app`) with a 404; send it to `/app/` so a
 * hand-typed URL works. Runs before the proxy, which would otherwise hand
 * `/app` to Next.
 */
function redirectBareBase(): Plugin {
  const bare = APP_BASE_PATH.replace(/\/$/, "");
  return {
    name: "redirect-bare-base",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        if (path !== bare) return next();
        res.statusCode = 308;
        res.setHeader("Location", APP_BASE_PATH + (query ? `?${query}` : ""));
        res.end();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Production is served from the Convex deployment by the `app` instance of
  // @convex-dev/static-hosting, registered at /app/ in
  // packages/api/convex/http.ts (the marketing site owns /). Dev serves from
  // the same path.
  //
  // Deliberately not STATIC_HOSTING_BASE_PATH: the static-hosting CLI derives
  // that from an `httpPrefix` mount, and this component has none (http.ts
  // registers it), so the CLI would say "/".
  base: APP_BASE_PATH,
  plugins: [react(), redirectBareBase()],
  server: {
    // Bind IPv4 loopback explicitly. Vite can otherwise listen on IPv6 [::1],
    // which the IPv4-targeting Portless proxy can't reach (-> 502).
    host: "127.0.0.1",
    // Only the default, for a bare `vite`. Everything that runs this server on
    // purpose passes `--port`, which wins: portless assigns a free one (and
    // `--strictPort` with it), and `pnpm dev:ports` and the e2e suite each hand
    // it one of their own. Nothing pins 5173 any more — that is what lets two
    // worktrees, or a suite and a dev server, run side by side.
    port: 5173,
    strictPort: true,
    // Only under portless (it sets PORTLESS_URL): this server is then the
    // front door at https://matchbuild.localhost, serving the app at /app/ and
    // proxying everything else, so dev has production's one-origin layout.
    // /admin goes to the admin app's Vite server (its HMR socket too, under
    // its own base); every other path outside /app goes to Next. Vite's own
    // HMR socket and modules (all under the base) stay local; `ws` carries the
    // others.
    //
    // `pnpm dev:ports` and the e2e suite deliberately leave PORTLESS_URL unset
    // and run the three servers on ports of their own, each answering only for
    // itself — there is no marketing site behind this one to proxy to.
    proxy: process.env.PORTLESS_URL
      ? {
          "^/admin(?:/|$)": {
            // Where `pnpm dev` runs the platform admin app (apps/admin `dev`
            // script), served from here at /admin/ as in production.
            target: process.env.ADMIN_DEV_URL ?? portlessSibling("admin"),
            changeOrigin: true,
            // Portless's local CA is not in Node's trust store.
            secure: false,
            ws: true,
          },
          "^/(?!(?:app|admin)(?:/|$))": {
            // Where `pnpm dev` runs the marketing site (apps/www `dev` script).
            target: process.env.WWW_DEV_URL ?? portlessSibling("www"),
            changeOrigin: true,
            // Portless's local CA is not in Node's trust store.
            secure: false,
            ws: true,
          },
        }
      : undefined,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
