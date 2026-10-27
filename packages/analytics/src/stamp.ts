import type { CaptureResult } from "posthog-js";

/** What every event is stamped with; see `AnalyticsProvider`. */
export interface EventStamp {
  product: string;
  surface: string;
}

/**
 * Stamps `product` and `surface` onto an event as it is sent — the body of the
 * provider's `before_send`. Applied over the event's own properties, so a
 * capture call cannot file itself under another product or surface. A `null`
 * event is one an earlier hook dropped, and stays dropped.
 */
export function stampEvent(
  event: CaptureResult | null,
  stamp: EventStamp,
): CaptureResult | null {
  return (
    event && {
      ...event,
      properties: {
        ...event.properties,
        product: stamp.product,
        surface: stamp.surface,
      },
    }
  );
}
