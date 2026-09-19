import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Typed, validated environment variables for the admin app. Import `env`
 * rather than reading `import.meta.env`, so a missing URL fails at startup.
 */
export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    // The same deployment as apps/app; the admin app has no backend of its own.
    VITE_CONVEX_URL: z.url(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
