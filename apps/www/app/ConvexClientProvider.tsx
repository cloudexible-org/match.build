"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { env } from "@/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

// The marketing site is a static export with no auth — sign-in lives in the
// Vite app at /app/. Convex is available here for public reads (e.g. a
// waitlist) only.
export function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
