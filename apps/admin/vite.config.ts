import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Must match the `pathPrefix` for `components.admin` in convex/http.ts. */
const ADMIN_BASE_PATH = "/admin/";

/**
 * Vite answers the bare base path (`/admin`) with a 404; send it to `/admin/`
 * so a hand-typed URL works (see the same plugin in apps/app).
 */
function redirectBareBase(): Plugin {
  const bare = ADMIN_BASE_PATH.replace(/\/$/, "");
  return {
    name: "redirect-bare-base",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        if (path !== bare) return next();
        res.statusCode = 308;
        res.setHeader("Location", ADMIN_BASE_PATH + (query ? `?${query}` : ""));
        res.end();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Production is served from the Convex deployment by the `admin` instance of
  // @convex-dev/static-hosting, registered at /admin/ in
  // packages/api/convex/http.ts. In dev, portless serves this server at
  // https://admin.matchmaker.localhost, and apps/app's Vite server (the front
  // door at https://matchmaker.localhost) proxies /admin/ here, so dev has
  // production's one-origin layout.
  base: ADMIN_BASE_PATH,
  plugins: [react(), redirectBareBase()],
  server: {
    // IPv4 loopback, for the IPv4-targeting portless proxy (see apps/app).
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});
