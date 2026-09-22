"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import type { ReactNode } from "react";
import { sanitizeProperties } from "./paths";

export { usePostHog } from "posthog-js/react";
export type { AnalyticsIdentity } from "./identity";
export { useAnalyticsIdentity } from "./identity";
export type { RouteMask } from "./paths";
export { createPathMask, maskUrl, sanitizeProperties } from "./paths";
export { posthog };

const DEFAULT_API_HOST = "https://us.i.posthog.com";

/**
 * The config snapshot to opt into. `'2025-05-24'` changes exactly one default,
 * `capture_pageview: 'history_change'`, which is the one we want: without it
 * posthog-js keeps the pre-2025 behaviour of capturing a single `$pageview` on
 * load, and a client-routed app reports one pageview per session no matter how
 * far the person travels. The later snapshots bundle replay and rageclick
 * changes that want deciding on their own merits, so this stays pinned rather
 * than tracking the newest.
 */
const CONFIG_DEFAULTS = "2025-05-24";

export interface AnalyticsProviderProps {
  /** PostHog project API key. When absent, analytics is not initialized. */
  apiKey?: string;
  /** PostHog API host. Defaults to PostHog US cloud. */
  apiHost?: string;
  /**
   * Masks the personal parts of a path before it is sent. Build one with
   * `createPathMask` from the app's own routes. Without it paths are sent
   * as-is, which is only safe for an app whose routes are all static.
   */
  maskPath?: (pathname: string) => string;
  children: ReactNode;
}

/**
 * Mounts the PostHog provider only when an API key is present. With no key the
 * provider is skipped entirely, so `usePostHog()` cleanly no-ops in consumers —
 * keeping local and CI runs silent without any conditional logic at call sites.
 *
 * Tip: for custom events tied to UI transitions, diff state in a hook rather
 * than firing from a reducer, so business logic stays free of side effects.
 */
export function AnalyticsProvider({
  apiKey,
  apiHost = DEFAULT_API_HOST,
  maskPath,
  children,
}: AnalyticsProviderProps): ReactNode {
  if (!apiKey) {
    return children;
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        api_host: apiHost,
        defaults: CONFIG_DEFAULTS,
        sanitize_properties: maskPath
          ? (properties) => sanitizeProperties(properties, maskPath)
          : null,
      }}
    >
      {children}
    </PostHogProvider>
  );
}
