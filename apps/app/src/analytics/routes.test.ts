import { describe, expect, it } from "vitest";
import { createAppPathMask, workspaceUsernameIn } from "./routes";

// The mount the app actually ships under (vite.config.ts `base`).
const BASE_PATH = "/app/";
const maskAppPath = createAppPathMask(BASE_PATH);
const workspaceUsername = (pathname: string) =>
  workspaceUsernameIn(BASE_PATH, pathname);

describe("maskAppPath", () => {
  it("hides the invite token", () => {
    expect(maskAppPath("/app/invite/s3cr3t-token")).toBe("/app/invite/:token");
  });

  it("hides who a candidate is and whose workspace holds them", () => {
    expect(maskAppPath("/app/mm/maya/c/k17abc")).toBe(
      "/app/mm/:username/c/:candidateId",
    );
    expect(maskAppPath("/app/invitations/k17abc")).toBe(
      "/app/invitations/:candidateId",
    );
    expect(maskAppPath("/app/c/maya")).toBe("/app/c/:matchmakerUsername");
  });

  it("keeps the routes that are funnel steps in their own right", () => {
    expect(maskAppPath("/app/mm/new")).toBe("/app/mm/new");
    expect(maskAppPath("/app/c/mm/discover")).toBe("/app/c/mm/discover");
    expect(maskAppPath("/app/sign-in")).toBe("/app/sign-in");
    expect(maskAppPath("/app/settings")).toBe("/app/settings");
  });

  it("distinguishes the workspace sub-pages from one another", () => {
    expect(maskAppPath("/app/mm/maya")).toBe("/app/mm/:username");
    expect(maskAppPath("/app/mm/maya/matches")).toBe(
      "/app/mm/:username/matches",
    );
    expect(maskAppPath("/app/mm/maya/onboard")).toBe(
      "/app/mm/:username/onboard",
    );
    expect(maskAppPath("/app/mm/maya/settings")).toBe(
      "/app/mm/:username/settings",
    );
  });
});

describe("workspaceUsername", () => {
  it("finds the matchmaker whose workspace the path is inside", () => {
    expect(workspaceUsername("/app/mm/maya")).toBe("maya");
    expect(workspaceUsername("/app/mm/maya/c/k17abc")).toBe("maya");
    expect(workspaceUsername("/app/mm/maya/settings")).toBe("maya");
  });

  it("returns null outside a workspace", () => {
    expect(workspaceUsername("/app/")).toBeNull();
    expect(workspaceUsername("/app/settings")).toBeNull();
    expect(workspaceUsername("/app/c/maya")).toBeNull();
  });

  it("does not treat the create page as a workspace", () => {
    // /mm/new is where a profile is made; there is no tenant to file events
    // under until it exists.
    expect(workspaceUsername("/app/mm/new")).toBeNull();
  });
});
