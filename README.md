# Matchmaker

The operating system for independent human matchmakers: a unified client inbox
(email + in-app chat), AI-drafted replies in the matchmaker's voice, and an
AI-enriched client profile. See [PRD.md](./PRD.md) for the product spec.

Built on [turbostack](https://github.com/cloudexible-org/turbostack).

## Tech stack

- **Monorepo:** [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/)
- **Backend:** [Convex](https://convex.dev/) (database, functions, scheduling, agents, HTTP actions)
- **App:** [Vite](https://vite.dev/) + [React](https://react.dev/): the matchmaker and client app, served at `/app/`
- **Marketing site:** [Next.js 16](https://nextjs.org/) as a static export, served at `/`
- **Hosting:** both frontends are served from the Convex deployment (`https://<deployment>.convex.site`) by [`@convex-dev/static-hosting`](https://www.npmjs.com/package/@convex-dev/static-hosting)
- **Email:** [Resend](https://resend.com/) via the Convex Resend component
- **Auth:** [Clerk](https://clerk.com/) (optional; the stack runs auth-free when its env vars are unset)
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

Prerequisites: Node.js 26 (`nvm use`), pnpm, a [Convex](https://convex.dev/) account.

```bash
pnpm install
pnpm setup:envs                  # copies every .env.example to .env.local
cd packages/api && npx convex dev # links a Convex deployment, writes .env.local
```

Copy the deployment URL into `apps/app/.env.local` (`VITE_CONVEX_URL`) and
`apps/www/.env.local` (`NEXT_PUBLIC_CONVEX_URL`), then from the root:

```bash
pnpm dev
```

Portless serves `https://www.matchmaker.localhost` and
`https://app.matchmaker.localhost/app/`.

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
app, `STATIC_HOSTING_BASE_PATH=/app/`. Uploads publish atomically, so a failed
upload leaves the previous version live.

### Auth (Clerk)

1. Clerk Dashboard → **JWT Templates** → **New** → **Convex**.
2. Convex Dashboard → **Settings** → **Environment Variables** → set
   `CLERK_JWT_ISSUER_DOMAIN` to the Clerk Frontend API URL (dev and prod).
3. Add the provider in `packages/api/convex/auth.config.ts` (see the comment there).
4. In Clerk → **Domains**, allow the `https://<deployment>.convex.site` origin.

## Contributing

Read [AGENTS.md](./AGENTS.md) (symlinked as `CLAUDE.md`) for the repo's
standards: Conventional Commits, Tailwind v4 + shadcn/ui, Base UI only, strict
types, Biome.
