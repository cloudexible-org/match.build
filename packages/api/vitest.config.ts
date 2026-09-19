import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test recommends `edge-runtime`, but its peer dependency makes pnpm
    // install a second copy of vitest whose types clash with @repo/ui's
    // Storybook addon. These functions use nothing Node lacks, so plain `node`
    // is enough.
    environment: "node",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
