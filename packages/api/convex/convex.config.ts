import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// All three frontends are served from this deployment's `.convex.site` origin by
// two instances of @convex-dev/static-hosting. Neither is mounted with an
// `httpPrefix`: convex/http.ts owns the whole URL space and registers them as
// catch-alls behind the app's own routes —
//
//   /.well-known/…  Convex Auth's OpenID discovery + JWKS (must be at the root)
//   /api/…          this app's HTTP actions
//   /app/…          `app` — Vite React app            (apps/app/dist)
//   /admin/…        `admin` — platform admin app      (apps/admin/dist)
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
    // HMAC key that invite-link tokens are derived from (invites/helpers.ts).
    // Set by `invites:setup`, and by the e2e suite on its own backend.
    // Rotating it breaks every open invite link.
    INVITE_LINK_SECRET: v.optional(v.string()),
    // Comma-separated emails of the platform admins, who can sign in to
    // apps/admin (admin/helpers.ts). Unset means nobody can.
    PLATFORM_ADMIN_EMAILS: v.optional(v.string()),
    // Web-push VAPID keys (prd/phase-1.md §8.2), set by `push:setup`. The
    // public key is also handed to the browser so it can subscribe; the
    // private key signs the request to the push service. Unset means push is
    // off and email is the only channel — which is the state of any
    // deployment that hasn't run the script, including the e2e backend
    // unless a spec sets them.
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    // The `sub` claim in the VAPID JWT: how a push service reaches us about a
    // misbehaving sender. A `mailto:` or `https:` URL. Defaults to SITE_URL.
    VAPID_SUBJECT: v.optional(v.string()),
    // How long a notification waits before it gives up on you being there
    // (notifications/rules.ts). Unset means the spec's 30s / 5min; prd §12
    // expects these to be tuned with the first matchmaker.
    NOTIFICATION_PUSH_DELAY_SECONDS: v.optional(v.string()),
    NOTIFICATION_EMAIL_DELAY_SECONDS: v.optional(v.string()),
  },
});
app.use(staticHosting, { name: "www" });
app.use(staticHosting, { name: "app" });
app.use(staticHosting, { name: "admin" });

export default app;
