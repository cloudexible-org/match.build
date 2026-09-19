import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Must match the `pathPrefix` for `components.app` in convex/http.ts. */
const APP_BASE_PATH = "/app/";

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
  plugins: [react()],
  server: {
    // Bind IPv4 loopback explicitly. Vite can otherwise listen on IPv6 [::1],
    // which the IPv4-targeting Portless proxy can't reach (-> 502).
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
