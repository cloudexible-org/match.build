# Agent Instructions & Guidelines

This document defines the core standards and automated workflows that any AI agent must follow when contributing to this repository.

## 1. Environment & Terminal Execution
* **OS Awareness:** Before executing any terminal commands, identify the host Operating System.
* **Command Syntax:** * Use POSIX-compliant commands for macOS/Linux.
    * Use PowerShell or CMD-specific syntax if the environment is detected as Windows.
* **Package Manager:** Always use `pnpm` for all package operations and script executions (e.g., `pnpm dev`, `pnpm install`).

## 2. Local Scratch Space
* **Use `.scratch/`:** For any temporary file — throwaway scripts, repro cases, screenshots, logs, dumps, draft notes, intermediate output — write it under `.scratch/` instead of `/tmp` or the repo root. Its contents are gitignored, so nothing leaks into a commit.
* **Namespace your work:** Create `.scratch/<short-task-name>/` rather than dropping loose files at the folder root.
* **Never depend on it:** Committed code, docs, tests, and config must not reference a `.scratch/` path — the folder is empty on every other machine and in CI. If an artifact turns out to be worth keeping, move it into the tracked repo (`scripts/`, `docs/assets/`, fixtures beside their tests) and call that out.
* **No secrets:** Credentials belong in `.env.local`, not here.
* See `.scratch/README.md` for the full rundown.

## 3. Documentation & Changelog
* **Automatic Logging:** Every time a new feature is implemented, a bug is fixed, or a breaking change is introduced, you must update `docs/changelog.md`.
* **Entry Format:** Use [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format:
    * `### Added` for new features.
    * `### Fixed` for bug fixes.
    * `### Changed` for refactors.
* **Context:** Include a brief description of *what* changed and *why*.

## 4. TypeScript & Type Safety
* **No `any`:** The use of `any` is strictly prohibited. Use `unknown` if a type is truly dynamic, or define proper interfaces/types.
* **Shared Types:** Logic for data fetching must leverage the generated types from `packages/api` (Convex).
* **Inference:** Allow TypeScript to infer types where obvious, but explicitly define types for function parameters, return values, and complex state objects.

## 5. Testing & Quality Assurance
* **Page Objects Pattern:** Whenever a new page is created in `apps/app` or a significant UI component is added to `packages/ui`, you must:
    1.  Update or create the corresponding file in `e2e/page-objects/`.
    2.  Ensure selectors are resilient (prefer data-attributes like `data-testid` over CSS classes).
* **E2E / Integration Tests:** The `apps/e2e` directory holds one Playwright project per app: `app` drives the Vite app (`apps/app`), `www` drives the Next.js marketing site (`apps/www`), each on a port allocated for the run, and `app-convex` drives `apps/app` against a real, seeded Convex local backend. Specs live in `specs/<app>/` and page objects in `page-objects/<app>/`; each project pins its own `baseURL`, so put a spec in the directory of the app it asserts against. Ensure that new features are accompanied by a Playwright test script utilizing the updated page objects.
* **Convex-backed specs:** Anything asserting on backend data belongs in `specs/app-convex/`, seeded from `packages/api/convex/seed/e2e/fixture.ts`. The suite talks only to a **local, anonymous** Convex deployment, whose port is allocated fresh for every run — never hard-code 3210 or trust the port recorded in `.convex/local/default/config.json`, and read `docs/e2e-architecture.md` §1a and §1c before touching that harness: seeding wipes the database, and a wrong port can wipe a *different project's*.
* **The suite is independent of `pnpm dev` and of other worktrees:** any number of runs, one per git worktree, can go at once next to each worktree's `pnpm dev`. Each run allocates its own ports (outside the OS's ephemeral range), builds Next into the worktree's own `distDir`, and drives the worktree's own local Convex backend under a per-worktree lock, so it never touches your dev servers, a sibling's backend, or your cloud deployment. Keep it that way — do not reintroduce a fixed port, `listen(0)` port picking, a shared `distDir`, or `reuseExistingServer: true` for any server.
* **Unit Tests:** New utility functions or business logic in `packages/api` or `apps/app` must have a corresponding `.test.ts` file for Vitest.

## 6. Styling & Components
* **Tailwind v4:** Use the CSS-first approach. Do not use deprecated Tailwind v3 configuration patterns.
* **Shadcn UI:** Use shadcn/ui components whenever possible for UI elements.
* **Base UI Primitives:** Only use **Base UI** primitives for headless components. Do **not** use Radix UI primitives at all.
* **Design System tokens:** Always use the CSS variables defined in `global.css` (e.g. `--color-primary`, `--radius-md`) for colors, spacing, and other design tokens. Do not hardcode raw values.
* **Biome:** Run `pnpm lint` and `pnpm format` (via Biome) before marking a task as complete to ensure the codebase remains clean.

## 7. Commit Standards
* **Conventional Commits:** All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add user login`, `fix: resolve crash on startup`).

## 8. Convex Backend Layout
* **One directory per domain:** backend code lives in `packages/api/convex/<domain>/` (e.g. `convex/waitlist/`), never as loose files at the `convex/` root. Only `schema.ts`, `http.ts`, `convex.config.ts`, `auth.config.ts`, `auth.ts` and `crons.ts` stay at the root (`auth.ts` because Convex Auth's client calls it as `auth:signIn`).
* **Access helpers:** every function derives who the caller is and which tenant they may touch from `requireUser` (`users/helpers.ts`), `requireMatchmaker` (`matchmakers/helpers.ts`) or `requireCandidateSelf` (`candidates/helpers.ts`), never from arguments alone. Any change to audited state calls `recordAudit` (`audit/helpers.ts`) in the same mutation. See `prd/phase-1.md` §5 and §9.
* **Four files per domain (plus `actions.ts` where needed), split by role:**
    * `rules.ts` — pure validation, normalisation and limits. No Convex imports, so frontends can import it through `@repo/api` and validate exactly as the server does.
    * `mutations.ts` — `mutation` / `internalMutation` definitions only.
    * `queries.ts` — `query` / `internalQuery` definitions only.
    * `helpers.ts` — plain functions that take a `ctx` (lookups, shared writes) and are called from that domain's queries and mutations. Never registered as functions.
    * `actions.ts` — only where a domain calls out of Convex (email, later LLMs): `action` / `internalAction` definitions, usually scheduled from a mutation. Never `"use node"` in a file that also defines queries or mutations.
* **Tests sit beside the file they cover:** `rules.test.ts`, `mutations.test.ts` (convex-test), etc.
* Function references follow the path: `api.<domain>.mutations.<name>`, `internal.<domain>.queries.<name>`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
