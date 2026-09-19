import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // Production is served from the Convex deployment by the `app` instance of
  // @convex-dev/static-hosting, mounted at /app/ (the marketing site owns /).
  // The static-hosting CLI sets STATIC_HOSTING_BASE_PATH to the mount when it
  // builds; default to /app/ so a plain `vite build` matches, and dev serves
  // from the same path.
  base: process.env.STATIC_HOSTING_BASE_PATH ?? "/app/",
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
