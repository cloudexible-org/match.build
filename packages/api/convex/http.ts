import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

// App-owned HTTP actions. `convex.config.ts` mounts this router under /api/,
// so the paths below are served at `https://<deployment>.convex.site/api/...`
// (the static sites own `/` and `/app/`).
const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response("ok")),
});

export default http;
