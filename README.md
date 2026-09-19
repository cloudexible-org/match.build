# Matchmaker

The operating system for independent human matchmakers: invite candidates from
Instagram/WhatsApp into an in-app chat, with AI-drafted replies in the
matchmaker's voice and an AI-enriched candidate profile coming in later phases.
See [prd/](./prd/README.md) for the product spec.

Built on [turbostack](https://github.com/cloudexible-org/turbostack).

## Tech stack

- **Monorepo:** [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/)
- **Backend:** [Convex](https://convex.dev/) (database, functions, scheduling, agents, HTTP actions)
- **App:** [Vite](https://vite.dev/) + [React](https://react.dev/): the matchmaker and candidate app, served at `/app/`
- **Marketing site:** [Next.js 16](https://nextjs.org/) as a static export, served at `/`
- **Hosting:** both frontends are served from the Convex deployment (`https://<deployment>.convex.site`) by [`@convex-dev/static-hosting`](https://www.npmjs.com/package/@convex-dev/static-hosting)
- **Email:** [Resend](https://resend.com/) for sign-in codes, invitations and notifications
- **Auth:** [Convex Auth](https://labs.convex.dev/auth): email + one-time code
- **UI:** Tailwind CSS v4, shadcn/ui, Base UI (no Radix)
- **Tooling:** Biome, Playwright, Vitest + Storybook, lefthook + commitlint, PostHog (`@repo/analytics`)

## Project structure

```text
├── apps/
│   ├── app/          # Vite React app (mounted at /app/)
│   ├── admin/        # Vite React platform admin app (mounted at /admin/)
│   ├── www/          # Next.js marketing site (static export, mounted at /)
│   └── e2e/          # Playwright end-to-end tests
├── packages/
│   ├── api/          # Convex backend: schema, functions, http.ts, static-hosting mounts
│   ├── ui/           # Shared UI components
│   ├── analytics/    # Key-gated PostHog provider
│   └── config/       # Shared TypeScript configs
└── docs/             # Changelog and architecture notes
```

### URL layout (one origin)

| Path | Served by |
|---|---|
| `/` | `www` static-hosting instance (`apps/www/out`) |
| `/app/…` | `app` static-hosting instance (`apps/app/dist`, SPA fallback) |
| `/admin/…` | `admin` static-hosting instance (`apps/admin/dist`, SPA fallback) — platform admins only |
| `/api/…` | Convex HTTP actions in `packages/api/convex/http.ts` (e.g. the Resend inbound webhook) |

The mounts are configured in `packages/api/convex/convex.config.ts`.

## Getting started

Prerequisites: Node.js 26 (`nvm use`), pnpm, a [Convex](https://convex.dev/) account,
and the [Doppler CLI](https://docs.doppler.com/docs/install-cli) with access to the
`matchmaker` project.

```bash
pnpm install
doppler login                     # once per machine
doppler setup --no-interactive    # binds apps/app, apps/admin and apps/www via doppler.yaml
cd packages/api && npx convex dev # links a Convex deployment, writes .env.local
```

The app dev scripts run under `doppler run`, so `VITE_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_URL` and friends come from the `matchmaker` project, one
branch config per app (`dev_app`, `dev_www`) under the `dev` environment.
Doppler binds by absolute path, so run `doppler setup` again in every new
checkout or worktree. Doppler values override any `.env.local`. Then from the root:

```bash
pnpm dev
```

Open **`https://matchmaker.localhost`**: the marketing site at `/`, the app at
`/app/` and the admin app at `/admin/`, on one origin as in production.
Portless routes by hostname only, so the app's Vite server is the front door:
it proxies `/admin/` to the admin app's Vite server and every other path
outside `/app/` to the Next dev server. Portless also serves those two directly
at `https://www.matchmaker.localhost` and `https://admin.matchmaker.localhost`.

## Development

- `pnpm dev`: all apps and `convex dev` via Turbo
- `pnpm lint` / `pnpm format` / `pnpm check`: Biome
- `pnpm typecheck`
- `pnpm test`: Storybook component tests
- `pnpm test:e2e`: Playwright (runs its own servers and a local Convex backend)
- `pnpm test:e2e:observe`: the same suite headed, one worker, 500 ms between
  actions, so you can watch it (`E2E_SLOW_MO=1000` to slow it further)
- `pnpm build`

## Deploying

Everything ships to the Convex deployment. There is no separate frontend host.

```bash
npx convex login   # first time only
pnpm ship          # convex deploy → build + upload www, app and admin (production)
```

To smoke-test the hosted sites on your **dev** deployment first:

```bash
pnpm ship:preview
```

The static-hosting CLI builds each app with the target deployment's
`VITE_CONVEX_URL` (mapped to `NEXT_PUBLIC_CONVEX_URL` for `www`) and, for the
app, a fixed Vite `base` of `/app/` (see `apps/app/vite.config.ts`). Uploads
publish atomically, so a failed upload leaves the previous version live.

### Custom domain

Production is served at **https://www.aileenlancif.com** (interim, until a
product domain is bought). DNS is on Cloudflare; custom domains need the
Convex Pro plan. The production deployment has two custom domains:

| Domain | Convex side | Serves |
| --- | --- | --- |
| `www.aileenlancif.com` | HTTP actions (`.convex.site`), overrides `CONVEX_SITE_URL` | `/` (www), `/app/` (app), `/api/`, `/.well-known/` (auth) |
| `api.aileenlancif.com` | API (`.convex.cloud`), overrides `CONVEX_CLOUD_URL` | The WebSocket/HTTP client API. The sites are built against it, so removing it breaks them until they are rebuilt. |

The apex `aileenlancif.com` redirects to `www`. Nothing is hosted on Vercel.

To set it up again, or to move to a new domain:

1. Convex Dashboard → **production** deployment → **Settings** → **Custom
   Domains** → add `www.<domain>` **for HTTP actions** and `api.<domain>` for
   the API.
2. In Cloudflare DNS, create exactly the records the dashboard shows (a CNAME
   to `convex.domains` for each, plus any TXT verification record). Set the
   CNAMEs to **DNS only** (grey cloud) so Convex can issue the certificates.
   Remove any older records for those names first (e.g. a previous host's
   CNAME). Until Convex has verified a domain, requests to it return
   Cloudflare **error 1014**.
3. Redirect the apex to `www`: add a proxied placeholder record `A @ 192.0.2.1`
   (orange cloud), then a Cloudflare redirect rule from the **"Redirect from
   root to WWW"** template (`https://<domain>/*` → `https://www.<domain>/${1}`,
   301, query string preserved). Not "WWW to root", which is the opposite. If
   Cloudflare warns that the rule may not apply to `www`, the rule is backwards.
   Don't fix it by proxying `www`.
4. Once both domains show as verified, set the overrides on the same settings
   page: `CONVEX_SITE_URL` → `https://www.<domain>` and `CONVEX_CLOUD_URL` →
   `https://api.<domain>`. Make sure each one is saved.
5. **Redeploy the backend and rebuild both sites** (`pnpm ship`). Convex Auth
   stamps tokens with `CONVEX_SITE_URL` at runtime, but `convex/auth.config.ts`
   only picks up the domain to trust on a push. Until you redeploy, every
   sign-in fails. The site builds embed the client API URL, so they need the
   rebuild to switch to the new `api.` domain. To check, open
   `https://www.<domain>/.well-known/openid-configuration`: its `issuer` should
   be the new origin.
6. Point sign-in at the new origin. On a production deployment without auth
   keys yet, run
   `pnpm --filter @repo/api auth:setup --prod --site-url https://www.<domain>/app`
   (see *Auth* below). If the keys already exist, change only the URL, since
   rotating the keys signs everyone out:
   `npx convex env set SITE_URL https://www.<domain>/app --prod`
7. Email: verify the domain in Resend, set `RESEND_API_KEY` on production,
   and make sure `SIGN_IN_FROM` in `packages/api/convex/email/rules.ts` uses
   that domain (today `no-reply@aileenlancif.com`). Resend refuses to send from
   an unverified domain.
8. Only then remove any old custom domain: in the Convex dashboard first, then
   its DNS record.

`pnpm ship` asks for confirmation before `convex deploy`, so run it from an
interactive terminal. It stops at the first failure. If an upload fails on a
network error, the backend is already deployed, so re-run only the upload that
failed (`pnpm --filter @repo/api run ship:www`, `ship:app` or `ship:admin`).

### Auth (Convex Auth)

Sign-in is an email plus a six-digit code (`packages/api/convex/auth.ts`).
Each deployment needs a signing key pair and the app's URL, set once:

```bash
pnpm --filter @repo/api auth:setup --site-url https://<deployment>.convex.site/app
```

Add `--prod` for the production deployment. Then set `RESEND_API_KEY` on the
deployment to send real email. Without it, codes are printed to the Convex logs
and written to the internal `emailOutbox` table. That's fine for development,
and it's how the e2e suite signs in.

### Platform admin app (`/admin/`)

The admin app signs in like any other account and then checks the address
against `PLATFORM_ADMIN_EMAILS` on the deployment — a comma-separated list.
Unset means nobody can use it:

```bash
npx convex env set PLATFORM_ADMIN_EMAILS you@example.com --prod
```

It has two pages: the platform-wide **audit trail** (filter by matchmaker,
candidate, acting account and action) and **sign-in codes**, which issues a
code for any account so an admin can sign in to the app as them. The code is
shown, never emailed to the account's owner, and issuing it is recorded in the
audit trail as `account.sign_in_code_issued`. Spend it on the app's sign-in
page under **I already have a code** — "Email me a code" would replace it — and
use a private window, since `/app` and `/admin` share an origin (they keep
separate sessions, but signing in as someone else replaces your own app
session).

### Invite links

Invite-link tokens are derived from a per-deployment secret, so the database
alone can't produce a working link (`packages/api/convex/invites/helpers.ts`).
Each deployment needs it set once, before anyone onboards a candidate:

```bash
pnpm --filter @repo/api invites:setup
```

Add `--prod` for the production deployment. Rotating it (`--force`) breaks
every open invite link; the candidates can be re-invited.

Convex validates session tokens through the OpenID discovery document at
`<site>/.well-known/openid-configuration`, so `convex/http.ts` owns the root of
the URL space and registers the three static sites behind it (see
`convex/convex.config.ts`).

## Contributing

Read [AGENTS.md](./AGENTS.md) (symlinked as `CLAUDE.md`) for the repo's
standards: Conventional Commits, Tailwind v4 + shadcn/ui, Base UI only, strict
types, Biome.
