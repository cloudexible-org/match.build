"use client";

import type { PostHogConfig } from "posthog-js";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { type ReactNode, useMemo } from "react";
import { sanitizeProperties } from "./paths";
import { stampEvent } from "./stamp";

export { usePostHog } from "posthog-js/react";
export type { AnalyticsIdentity } from "./identity";
export { useAnalyticsIdentity } from "./identity";
export type { RouteMask } from "./paths";
export { createPathMask, maskUrl, sanitizeProperties } from "./paths";
export type { EventStamp } from "./stamp";
export { stampEvent } from "./stamp";
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
 *
 * The shared "Cloudexible Products" PostHog project's other senders use
 * `'2026-06-25'` (cloudexible's `@repo/analytics`). Joining that project does
 * not move this one: both dates capture SPA pageviews the same way, and moving
 * it would be the replay and rageclick decision above, taken by accident.
 */
const CONFIG_DEFAULTS = "2025-05-24";

export interface AnalyticsProviderProps {
  /** PostHog project API key. When absent, analytics is not initialized. */
  apiKey?: string;
  /** PostHog API host. Defaults to PostHog US cloud. */
  apiHost?: string;
  /**
   * The product sending, stamped onto every event as `product`. Several
   * products report into one shared PostHog project, so this is what splits
   * them apart — `$host` cannot, since it says nothing about which product a
   * shared or reused domain belongs to.
   */
  product: string;
  /**
   * Which part of the product is sending (`www`, `app`, …), stamped onto every
   * event as `surface`. Needed even within one product: www and app are served
   * from one origin, so `$host` is the same for both.
   */
  surface: string;
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
  product,
  surface,
  maskPath,
  children,
}: AnalyticsProviderProps): ReactNode {
  const options = useMemo<Partial<PostHogConfig>>(
    () => ({
      api_host: apiHost,
      defaults: CONFIG_DEFAULTS,
      sanitize_properties: maskPath
        ? (properties) => sanitizeProperties(properties, maskPath)
        : null,
      // `before_send` rather than `register`: super-properties are persisted,
      // and www, app and admin share one origin — so one localStorage — in
      // production. A registered `surface` would follow a person from www into
      // the app until something overwrote it, and an event fired before that
      // would be filed under the wrong one. Stamped at send time, it is
      // derived from nothing and cannot drift.
      before_send: (event) => stampEvent(event, { product, surface }),
    }),
    [apiHost, product, surface, maskPath],
  );

  if (!apiKey) {
    return children;
  }

  return (
    <PostHogProvider apiKey={apiKey} options={options}>
      {children}
    </PostHogProvider>
  );
}
