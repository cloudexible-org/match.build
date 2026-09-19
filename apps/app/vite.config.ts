import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Must match the `pathPrefix` for `components.app` in convex/http.ts. */
const APP_BASE_PATH = "/app/";

/**
 * Where `pnpm dev` runs the marketing site (apps/www `dev` script). Under
 * portless this dev server is the front door at https://matchmaker.localhost,
 * serving the app at /app/ and proxying every other path to Next, so dev has
 * the same one-origin layout as production.
 */
const WWW_DEV_URL =
  process.env.WWW_DEV_URL ?? "https://www.matchmaker.localhost";

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
    port: 5173,
    strictPort: true,
    // Only under portless (it sets PORTLESS_URL): the e2e suite runs this
    // server on its own port with no marketing site behind it. The pattern
    // matches everything outside /app, so Vite's own HMR socket and modules
    // (all under the base) stay local; `ws` carries Next's HMR socket.
    proxy: process.env.PORTLESS_URL
      ? {
          "^/(?!app(?:/|$))": {
            target: WWW_DEV_URL,
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
