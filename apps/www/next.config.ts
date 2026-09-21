import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The marketing site is a static export served from the Convex deployment by
  // the `www` instance of @convex-dev/static-hosting (mounted at `/`). There is
  // no Node server in production, so no middleware/proxy, route handlers,
  // server actions, or request-time rendering — everything must prerender.
  // `pnpm --filter @repo/api deploy` uploads the resulting `out/` directory.
  output: "export",
  // Emit `/pricing/index.html` rather than `/pricing.html`. The static-hosting
  // component serves files by exact path and SPA-falls back to `/index.html`,
  // so directory-style output is what makes `/pricing` resolve.
  trailingSlash: true,
  // No image optimisation server on a static host.
  images: { unoptimized: true },
  // Next 16 keeps a dev lock at `<distDir>/lock`, so two `next dev` processes
  // on the same distDir refuse to run — "Another next dev server is already
  // running", and a different port does not help because the lock is on the
  // directory, not the port. The e2e suite therefore builds into its own
  // distDir (`NEXT_DIST_DIR=.next-e2e`, set in apps/e2e/playwright.config.ts),
  // which gives it its own lock and lets the suite run while `pnpm dev` is up.
  // Unset everywhere else, so dev, CI and deploys all use `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@repo/ui", "@repo/api"],
  // `pnpm dev` serves this app through portless at https://www.matchbuild.localhost,
  // and the app's Vite server proxies to it from https://matchbuild.localhost
  // (see apps/app/vite.config.ts),
  // which Next treats as cross-origin: it blocks /_next dev resources (including the
  // HMR client) from any unlisted host, so the page ships HTML but never hydrates.
  // Dev-only — Next ignores this in production builds.
  // `127.0.0.1` is where the Playwright suite serves this app (see
  // apps/e2e/playwright.config.ts). Without it Next blocks every /_next dev
  // chunk from that host, so the page ships HTML and never hydrates — which
  // reads as "every animation is broken" rather than as a blocked request.
  allowedDevOrigins: [
    "matchbuild.localhost",
    "*.matchbuild.localhost",
    "127.0.0.1",
    "localhost",
  ],
  // NOTE: `experimental.useTypeScriptCli` used to be set here. TypeScript 7 dropped
  // the JS Compiler API that Next's built-in type-checking loaded, so on Next 16.2
  // the flag was required to make Next shell out to the `tsc` binary instead.
  // Next 16.3 flipped that option's default to `true`, so the explicit setting is
  // now redundant. If Next is ever rolled back below 16.3, TypeScript must be rolled
  // back to 6.x as well — or this flag restored — otherwise `next build` fails at
  // the type-check step.
};

export default nextConfig;
