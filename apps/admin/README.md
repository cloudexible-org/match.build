# admin

The platform admin app: a Vite + React SPA served at `/admin/` on the same
origin and the same Convex deployment as `apps/app` (`packages/api/convex/
http.ts`). Today it has two pages:

- **Audit trail** (`/admin/audit`) — every matchmaker's `auditEvents`, newest
  first, filtered by matchmaker (and one of its candidates) *or* by the account
  that acted, and by action. The filters live in the URL.
- **Sign-in codes** (`/admin/sign-in-codes`) — issues a sign-in code for any
  account, so an admin can sign in to the app as them for support. The code is
  shown here rather than emailed to the account's owner, and issuing it is
  audited as `account.sign_in_code_issued`.

Who gets in is the deployment's business, not the app's: signing in works for
anyone, and `convex/admin/helpers.ts` then checks the verified address against
the comma-separated `PLATFORM_ADMIN_EMAILS` env var. Every function in
`convex/admin/` starts with `requirePlatformAdmin`, so the gate in the UI is a
courtesy, not the enforcement.

The session is kept under its own storage namespace (`src/main.tsx`), so
signing in to `/app` as someone else does not replace the admin's own session.

```bash
pnpm --filter admin dev     # portless: https://admin.matchmaker.localhost
                            # (and https://matchmaker.localhost/admin/ via apps/app)
pnpm --filter admin test    # Vitest, plain logic only; UI is covered by apps/e2e
```
