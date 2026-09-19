import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

/**
 * Every HTTP route on the deployment's `.convex.site` origin (see
 * convex.config.ts). Exact routes win over prefixes, and the longest prefix
 * wins among those, so the static sites only receive what nothing else
 * claims.
 */
const http = httpRouter();

// Convex Auth: /.well-known/openid-configuration and /.well-known/jwks.json.
// Convex validates session JWTs through this discovery document, which the
// OpenID spec places at the issuer's root — hence this router owning `/`.
auth.addHttpRoutes(http);

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => new Response("ok")),
});

// The product app under /app/ and the platform admin app under /admin/ (SPA
// fallback, so deep links survive a reload), then the marketing site for
// everything else. Keep APP_BASE_PATH / ADMIN_BASE_PATH in each app's
// vite.config.ts in step with the prefixes here.
registerStaticRoutes(http, components.app, { pathPrefix: "/app/" });
registerStaticRoutes(http, components.admin, { pathPrefix: "/admin/" });
registerStaticRoutes(http, components.www, { pathPrefix: "/" });

export default http;
