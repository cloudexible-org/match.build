import { ConvexHttpClient } from "convex/browser";
import { localBackendCredentials } from "./local-backend";

/**
 * A Convex client holding the **local** backend's admin key, which is what
 * lets the suite call *internal* functions (seeding, reading sign-in codes).
 *
 * Only ever built from `localBackendCredentials()`, so it cannot point at a
 * cloud deployment.
 */
export function adminClient(): ConvexHttpClient {
  const { url, adminKey } = localBackendCredentials();
  const client = new ConvexHttpClient(url);
  // `setAdminAuth` exists at runtime but is omitted from Convex's public
  // typings — it is how the CLI authenticates, and the only way to reach an
  // internal function without one. Cast narrowly rather than widening the
  // whole client (CLAUDE.md §4 forbids `any`).
  (client as unknown as { setAdminAuth(key: string): void }).setAdminAuth(
    adminKey,
  );
  return client;
}

/**
 * Sets environment variables on the local backend, through the same admin
 * endpoint `npx convex env set` uses — without paying the CLI's startup cost.
 */
export async function setBackendEnv(
  vars: Record<string, string>,
): Promise<void> {
  const { url, adminKey } = localBackendCredentials();
  const response = await fetch(`${url}/api/update_environment_variables`, {
    method: "POST",
    headers: {
      Authorization: `Convex ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changes: Object.entries(vars).map(([name, value]) => ({ name, value })),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not set env vars on the local backend: HTTP ${response.status} ${await response.text()}`,
    );
  }
}
