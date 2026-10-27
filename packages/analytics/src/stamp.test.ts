import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";
import { stampEvent } from "./stamp";

const stamp = { product: "match-build", surface: "app" };

function event(properties: Record<string, unknown>): CaptureResult {
  return { uuid: "u-1", event: "$pageview", properties } as CaptureResult;
}

describe("stampEvent", () => {
  it("adds product and surface and keeps everything else", () => {
    const stamped = stampEvent(event({ $pathname: "/app/" }), stamp);
    expect(stamped?.event).toBe("$pageview");
    expect(stamped?.properties).toEqual({
      $pathname: "/app/",
      product: "match-build",
      surface: "app",
    });
  });

  it("wins over a property of the same name set at capture", () => {
    const stamped = stampEvent(
      event({ product: "other", surface: "www" }),
      stamp,
    );
    expect(stamped?.properties).toMatchObject(stamp);
  });

  it("leaves a dropped event dropped", () => {
    expect(stampEvent(null, stamp)).toBeNull();
  });
});
