import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// Both frontends are served from this deployment's `.convex.site` origin by
// two instances of @convex-dev/static-hosting. Neither is mounted with an
// `httpPrefix`: convex/http.ts owns the whole URL space and registers them as
// catch-alls behind the app's own routes —
//
//   /.well-known/…  Convex Auth's OpenID discovery + JWKS (must be at the root)
//   /api/…          this app's HTTP actions
//   /app/…          `app` — Vite React app            (apps/app/dist)
//   /…              `www` — Next.js marketing site (static export, apps/www/out)
//
// Ship with `pnpm ship` from the repo root (see packages/api/package.json).
const app = defineApp({
  env: {
    // Resend API key for sign-in codes. Unset in local development and on the
    // e2e backend: emails then land in the internal `emailOutbox` table.
    RESEND_API_KEY: v.optional(v.string()),
    // The app's URL, which Convex Auth redirects back to. Set by `auth:setup`.
    SITE_URL: v.optional(v.string()),
  },
});
app.use(staticHosting, { name: "www" });
app.use(staticHosting, { name: "app" });

export default app;
