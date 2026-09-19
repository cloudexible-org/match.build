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
| `/api/…` | Convex HTTP actions in `packages/api/convex/http.ts` (e.g. the Resend inbound webhook) |

The mounts are configured in `packages/api/convex/convex.config.ts`.

## Getting started

Prerequisites: Node.js 26 (`nvm use`), pnpm, a [Convex](https://convex.dev/) account,
and the [Doppler CLI](https://docs.doppler.com/docs/install-cli) with access to the
`matchmaker_app` and `matchmaker_www` projects.

```bash
pnpm install
doppler login                     # once per machine
doppler setup --no-interactive    # binds apps/app and apps/www via doppler.yaml
cd packages/api && npx convex dev # links a Convex deployment, writes .env.local
```

The app dev scripts run under `doppler run`, so `VITE_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_URL` and friends come from each project's `dev` config.
Doppler binds by absolute path, so run `doppler setup` again in every new
checkout or worktree. Doppler values override any `.env.local`. Then from the root:

```bash
pnpm dev
```

Open **`https://matchmaker.localhost`**: the marketing site at `/` and the app
at `/app/`, on one origin as in production. Portless routes by hostname only,
so the app's Vite server is the front door and proxies every path outside
`/app/` to the Next dev server, which portless also serves directly at
`https://www.matchmaker.localhost`.

## Development

- `pnpm dev`: all apps and `convex dev` via Turbo
- `pnpm lint` / `pnpm format` / `pnpm check`: Biome
- `pnpm typecheck`
- `pnpm test`: Storybook component tests
- `pnpm test:e2e`: Playwright (runs its own servers and a local Convex backend)
- `pnpm build`

## Deploying

Everything ships to the Convex deployment. There is no separate frontend host.

```bash
npx convex login   # first time only
pnpm ship          # convex deploy → build + upload www → build + upload app (production)
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
Convex Pro plan.

1. Convex Dashboard → production deployment → **Settings** → **Custom Domains**
   → add `www.aileenlancif.com` **for HTTP actions** (the `.convex.site` side,
   which serves `/`, `/app/` and `/api/`).
2. In Cloudflare DNS, create exactly the records the dashboard shows (a CNAME
   for `www` plus a TXT verification record). Set the CNAME to **DNS only**
   (grey cloud) so Convex can issue the certificate.
3. Redirect the apex to `www` with a Cloudflare redirect rule
   (`aileenlancif.com/*` → `https://www.aileenlancif.com/${1}`, 301). The apex
   needs a proxied placeholder record, e.g. `A @ 192.0.2.1` (orange cloud).
4. Once the dashboard shows the domain verified, override the production
   `CONVEX_SITE_URL` to `https://www.aileenlancif.com` (same settings page), so
   links that functions generate use the custom domain. No rebuild is needed:
   the sites talk to the `.convex.cloud` API URL, which is unchanged.
5. Point sign-in at the new origin. On a production deployment without auth
   keys yet, run
   `pnpm --filter @repo/api auth:setup --prod --site-url https://www.aileenlancif.com/app`
   (see *Auth* below). If the keys already exist, change only the URL, since
   rotating the keys signs everyone out:
   `npx convex env set SITE_URL https://www.aileenlancif.com/app --prod`

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

Convex validates session tokens through the OpenID discovery document at
`<site>/.well-known/openid-configuration`, so `convex/http.ts` owns the root of
the URL space and registers the two static sites behind it (see
`convex/convex.config.ts`).

## Contributing

Read [AGENTS.md](./AGENTS.md) (symlinked as `CLAUDE.md`) for the repo's
standards: Conventional Commits, Tailwind v4 + shadcn/ui, Base UI only, strict
types, Biome.
