# match.build

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
│   ├── analytics/    # Key-gated PostHog provider, URL masking, identity
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
`matchbuild` project.

```bash
pnpm install
doppler login                     # once per machine
doppler setup --no-interactive    # binds apps/app, apps/admin and apps/www via doppler.yaml
cd packages/api && npx convex dev # links a Convex deployment, writes .env.local
```

The app dev scripts run under `doppler run`, so `VITE_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_URL` and friends come from the `matchbuild` project, one
branch config per app (`dev_app`, `dev_www`) under the `dev` environment.
Doppler binds by absolute path, so run `doppler setup` again in every new
checkout or worktree. Doppler values override any `.env.local`. Then from the root:

```bash
pnpm dev
```

Open **`https://matchbuild.localhost`**: the marketing site at `/`, the app at
`/app/` and the admin app at `/admin/`, on one origin as in production.
Portless routes by hostname only, so the app's Vite server is the front door:
it proxies `/admin/` to the admin app's Vite server and every other path
outside `/app/` to the Next dev server. Portless also serves those two directly
at `https://www.matchbuild.localhost` and `https://admin.matchbuild.localhost`.

In a **linked git worktree** portless prepends the branch to every one of those
hostnames — `https://<branch>.matchbuild.localhost` and friends — so each
worktree gets a set of its own and any number can run `pnpm dev` at once. The
app derives its siblings' hostnames from its own, so the front door of one
worktree never proxies into the Next server of another. `portless list` shows
what is currently registered, and `portless get matchbuild` prints this
checkout's front door.

### Without portless

Portless needs a trusted local CA and a proxy on port 443. When that is not
wanted — an agent driving the app over plain HTTP, a machine where the CA
cannot be installed — there is a second door:

```bash
pnpm dev:ports
```

Each app gets a free port of its own and is reachable directly, with the URLs
printed on startup:

```
www    http://127.0.0.1:20996/
app    http://127.0.0.1:31454/app/
admin  http://127.0.0.1:31446/admin/
```

Nothing proxies to anything here: `/app/` exists only on the app server and
`/admin/` only on the admin server, so the marketing site's links into the app
will 404. The one-origin layout is what `pnpm dev` is for. Ports are drawn
fresh every run from below the OS's ephemeral range, so this can run beside
`pnpm dev`, beside a test run and beside itself in another worktree. Pin one
with `DEV_APP_PORT` / `DEV_ADMIN_PORT` / `DEV_WWW_PORT`; write them to a file
for a caller that would rather not scrape stdout with `DEV_PORTS_FILE=<path>`;
skip `convex dev` with `DEV_CONVEX=0`, and Doppler with `DEV_DOPPLER=0`.

## Development

- `pnpm dev`: all apps and `convex dev` via Turbo, behind portless
- `pnpm dev:ports`: the same, without portless, one free port per app
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

Production is served at **https://www.match.build**. DNS is on Cloudflare;
custom domains need the Convex Pro plan. The production deployment has two
custom domains:

| Domain | Convex side | Serves |
| --- | --- | --- |
| `www.match.build` | HTTP actions (`.convex.site`), overrides `CONVEX_SITE_URL` | `/` (www), `/app/` (app), `/api/`, `/.well-known/` (auth) |
| `api.match.build` | API (`.convex.cloud`), overrides `CONVEX_CLOUD_URL` | The WebSocket/HTTP client API. The sites are built against it, so removing it breaks them until they are rebuilt. |

The apex `match.build` redirects to `www`. Nothing is hosted on Vercel.

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
   that domain (today `no-reply@match.build`). Resend refuses to send from
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

### Erasure requests

`/admin/erasure` handles a right-to-erasure request by **anonymising, not
deleting**. The person's name, address and handles are replaced everywhere —
their account, every matchmaker's record of them, and the values inside the
audit trail — while the conversations, notes and events stay where they are.
Each matchmaker keeps a full record of the work they did with an anonymous
candidate.

It is irreversible and takes the account's own address typed back to run. Two
deliberate limits: an account that owns a matchmaker profile can't be erased
(its candidates' data hangs off that profile), and message and note **text** is
left alone — whether a request reaches into what was written is the
matchmaker's call as data controller, not the platform's.

### Notifications

Email notifications work as soon as `RESEND_API_KEY` is set. **Web push needs
VAPID keys**, which identify the deployment to Apple's and Google's push
services (`packages/api/convex/notifications/helpers.ts`):

```bash
pnpm --filter @repo/api push:setup --subject mailto:you@example.com
```

Add `--prod` for production. Without them the app offers email only and says so
in `/settings`; rotating them (`--force`) silently breaks every push
subscription already stored, and browsers only notice when they next
re-subscribe.

Two optional overrides tune how long a notification waits for you to read the
message yourself (`prd/phase-1.md` §12 expects these to be tuned with the first
matchmaker). Unset means the spec's 30 seconds and 5 minutes:

```bash
npx convex env set NOTIFICATION_PUSH_DELAY_SECONDS 30
npx convex env set NOTIFICATION_EMAIL_DELAY_SECONDS 300
```

Notifications never carry the message, only who it is from: they are read on
lock screens and in inbox lists other people can see.

**iOS delivers web push only to an app installed on the home screen** (16.4+),
so the app ships a web app manifest and the settings page tells iPhone and iPad
users to add it before offering the switch. Email is their fallback until they
do.

Convex validates session tokens through the OpenID discovery document at
`<site>/.well-known/openid-configuration`, so `convex/http.ts` owns the root of
the URL space and registers the three static sites behind it (see
`convex/convex.config.ts`).

## Contributing

Read [AGENTS.md](./AGENTS.md) (symlinked as `CLAUDE.md`) for the repo's
standards: Conventional Commits, Tailwind v4 + shadcn/ui, Base UI only, strict
types, Biome.
