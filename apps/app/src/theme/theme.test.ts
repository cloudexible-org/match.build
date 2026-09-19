import { describe, expect, test } from "vitest";
import {
  applyTheme,
  nextTheme,
  readTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme";

const storage = (value: string | null) => ({ getItem: () => value });

describe("theme preference", () => {
  test("defaults to the system when nothing is stored, or storage is blocked", () => {
    expect(readTheme(storage(null))).toBe("system");
    expect(readTheme(storage("nonsense"))).toBe("system");
    expect(
      readTheme({
        getItem: () => {
          throw new Error("blocked in a private window");
        },
      }),
    ).toBe("system");
  });

  test("reads a stored choice", () => {
    expect(readTheme(storage("dark"))).toBe("dark");
    expect(THEME_STORAGE_KEY).toBe("matchmaker-theme");
  });

  test("cycles light → dark → system", () => {
    const seen: Theme[] = ["light"];
    for (let i = 0; i < 3; i++) {
      seen.push(nextTheme(seen[seen.length - 1]));
    }
    expect(seen).toEqual(["light", "dark", "system", "light"]);
  });

  test("applies a choice as a class, and system as neither", () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        toggle: (token: string, force: boolean) => {
          if (force) classes.add(token);
          else classes.delete(token);
        },
      },
    };

    applyTheme(root, "dark");
    expect([...classes]).toEqual(["dark"]);
    applyTheme(root, "light");
    expect([...classes]).toEqual(["light"]);
    applyTheme(root, "system");
    expect([...classes]).toEqual([]);
  });
});
