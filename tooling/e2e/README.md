# `tooling/e2e`

The Playwright suite. Specs and a config, and nothing else — the world they run
in comes from [`@repo/harness`](../harness).

```bash
pnpm test:e2e                  # all five projects
pnpm test:e2e:observe          # headed, one worker, half a second between actions
pnpm --filter e2e test:ui      # the Playwright UI
pnpm --filter e2e test:report  # the last run's HTML report
```

One directory per project, and a project pins the `baseURL` of the app it
drives — so **put a spec in the directory of the app it asserts against**:

| Directory | Drives | Backend |
|---|---|---|
| `specs/app/` | `apps/app` | none — chrome and client-side behaviour only |
| `specs/admin/` | `apps/admin` | none |
| `specs/www/` | `apps/www` | none |
| `specs/app-convex/` | `apps/app` | a real, seeded local Convex backend |
| `specs/admin-convex/` | `apps/admin` | the same backend |

A spec seeds its own world in `beforeAll` with `seedScenario()`, under a
namespace no other file can see, and signs in with `signInAs()` rather than
through the UI:

```ts
import { ConversationPage } from "@repo/harness/page-objects/app/matchmaker.page";
import { type Scenario, seedScenario } from "@repo/harness/scenario";
import { signInAs } from "@repo/harness/session";
```

Page objects live in the harness, not here, because the marketing captures use
them too. Adding a screen means adding its page object there and listing it in
that app's `index.ts`.

Tests within a file run serially and may share its world; different files run
in parallel. Keep a file under ~10 tests — it is the unit of parallelism, so
one long file sets the suite's wall-clock floor.

Full detail, including the local-backend guards and why nothing here may
hard-code a port: [`docs/e2e-architecture.md`](../../docs/e2e-architecture.md).
