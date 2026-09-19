import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

// Both frontends are served from this deployment's `.convex.site` origin by
// two instances of @convex-dev/static-hosting:
//
//   /        → `www`  — Next.js marketing site (static export, apps/www/out)
//   /app/    → `app`  — Vite React app            (apps/app/dist)
//   /api/... → this app's own HTTP actions (convex/http.ts), e.g. the Resend
//              inbound-email webhook
//
// Ship with `pnpm ship` from the repo root (see packages/api/package.json).
const app = defineApp({ httpPrefix: "/api/" });
app.use(staticHosting, { name: "www", httpPrefix: "/" });
app.use(staticHosting, { name: "app", httpPrefix: "/app/" });

export default app;
