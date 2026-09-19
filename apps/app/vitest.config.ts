import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests for plain logic only; UI is covered by apps/e2e.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
