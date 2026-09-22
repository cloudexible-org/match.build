import { describe, expect, it } from "vitest";
import { createPathMask, maskUrl, sanitizeProperties } from "./paths";

const maskPath = createPathMask({
  basePath: "/app/",
  literals: ["/", "/sign-in", "/mm/new"],
  patterns: [
    "/invite/:token",
    "/mm/:username",
    "/mm/:username/settings",
    "/mm/:username/c/:candidateId",
  ],
});

describe("createPathMask", () => {
  it("replaces dynamic segments with the pattern that produced them", () => {
    expect(maskPath("/app/invite/s3cr3t-token")).toBe("/app/invite/:token");
    expect(maskPath("/app/mm/maya")).toBe("/app/mm/:username");
    expect(maskPath("/app/mm/maya/settings")).toBe(
      "/app/mm/:username/settings",
    );
    expect(maskPath("/app/mm/maya/c/k17abc")).toBe(
      "/app/mm/:username/c/:candidateId",
    );
  });

  it("keeps a literal route rather than collapsing it into a pattern", () => {
    // Both are two segments under /mm, but only one of them names a tenant.
    expect(maskPath("/app/mm/new")).toBe("/app/mm/new");
    expect(maskPath("/app/sign-in")).toBe("/app/sign-in");
    expect(maskPath("/app/")).toBe("/app/");
    expect(maskPath("/app")).toBe("/app");
  });

  it("leaves an unrecognised path alone, so 404s stay visible", () => {
    expect(maskPath("/app/nope")).toBe("/app/nope");
    expect(maskPath("/app/mm/maya/unknown")).toBe("/app/mm/maya/unknown");
  });

  it("only strips the base at a segment boundary", () => {
    expect(maskPath("/application/mm/maya")).toBe("/application/mm/maya");
  });

  it("works without a base path", () => {
    const root = createPathMask({ patterns: ["/invite/:token"] });
    expect(root("/invite/abc")).toBe("/invite/:token");
  });

  it("does not treat an empty segment as a match", () => {
    expect(maskPath("/app/invite/")).toBe("/app/invite/");
  });
});

describe("maskUrl", () => {
  it("masks the path of an absolute URL", () => {
    expect(maskUrl("https://match.build/app/mm/maya", maskPath)).toBe(
      "https://match.build/app/mm/:username",
    );
  });

  it("masks a bare path", () => {
    expect(maskUrl("/app/mm/maya", maskPath)).toBe("/app/mm/:username");
  });

  it("masks a token carried in a redirect parameter", () => {
    // A signed-out visitor following an invite link: signInPath() copies the
    // whole path into ?next=, so the token is in the query string too.
    const masked = maskUrl(
      "https://match.build/app/sign-in?next=%2Fapp%2Finvite%2Fs3cr3t-token",
      maskPath,
    );
    expect(masked).not.toContain("s3cr3t-token");
    expect(decodeURIComponent(masked)).toContain("/app/invite/:token");
  });

  it("leaves campaign parameters and non-URLs alone", () => {
    expect(
      maskUrl("https://match.build/?utm_source=newsletter", maskPath),
    ).toBe("https://match.build/?utm_source=newsletter");
    expect(maskUrl("$direct", maskPath)).toBe("$direct");
  });
});

describe("sanitizeProperties", () => {
  it("masks every URL-shaped property and leaves the rest", () => {
    const sanitized = sanitizeProperties(
      {
        $current_url: "https://match.build/app/invite/s3cr3t-token",
        $pathname: "/app/invite/s3cr3t-token",
        $referrer: "https://match.build/app/mm/maya",
        $session_entry_pathname: "/app/mm/maya/c/k17abc",
        $referring_domain: "match.build",
        $browser: "Chrome",
      },
      maskPath,
    );

    expect(sanitized).toEqual({
      $current_url: "https://match.build/app/invite/:token",
      $pathname: "/app/invite/:token",
      $referrer: "https://match.build/app/mm/:username",
      $session_entry_pathname: "/app/mm/:username/c/:candidateId",
      $referring_domain: "match.build",
      $browser: "Chrome",
    });
  });

  it("reaches the person properties nested in $set_once", () => {
    const sanitized = sanitizeProperties(
      {
        $set_once: { $initial_current_url: "/app/invite/s3cr3t-token" },
      },
      maskPath,
    );

    expect(sanitized).toEqual({
      $set_once: { $initial_current_url: "/app/invite/:token" },
    });
  });

  it("does not mask a property that merely mentions a path", () => {
    const sanitized = sanitizeProperties(
      { $referring_domain: "match.build", title: "/app/mm/maya" },
      maskPath,
    );
    expect(sanitized.title).toBe("/app/mm/maya");
  });
});
