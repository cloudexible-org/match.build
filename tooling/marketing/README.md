# `tooling/marketing`

Demo clips of the working app, for the pitch deck. Run on demand, **never in
CI, never by `pnpm test:e2e`**.

```bash
pnpm capture:demo                          # drive the app, write frames + a manifest
pnpm render:demo -- --name inbox-ai-reply  # frames -> mp4 / gif / poster
```

Everything lands in `<root>/.scratch/marketing/demos/<name>/` — gitignored, so
re-rendering a clip twenty times leaves no trace in git history. Copy the file
you want into the deck when the pacing is right.

Needs `ffmpeg` on your PATH (`brew install ffmpeg`), or
`FFMPEG_PATH=/path/to/ffmpeg`.

To film one demo rather than all of them, name its spec:

```bash
pnpm --filter marketing exec playwright test captures/demos/inbox-ai-reply.spec.ts
```

Full guide, including how to add a demo for a new feature and the gotchas that
cost a re-shoot: [`docs/demo-videos.md`](../../docs/demo-videos.md).

## Why it is its own package

It reuses the whole test world — the local Convex backend, the seed, the app
servers, **the page objects** — from [`@repo/harness`](../harness), the same
package `tooling/e2e` builds on. What it does *not* share is the suite itself:
these scripts assert nothing, guard everything, and seed worlds of their own, so
a run of `pnpm test:e2e` must never reach them.

A package boundary is what guarantees that. A `testDir` pointing elsewhere would
not — someone eventually runs `playwright test` from the repo root — and it
would leave a capture's assert-nothing style sitting in a directory where every
other file is a test.
