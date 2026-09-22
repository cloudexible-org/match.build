import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests for plain logic only; the provider itself is exercised by
    // the apps that mount it.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
