/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// convex-test needs every function module (and `_generated`) up front. Kept
// inline rather than in a shared setup file: anything under convex/ that is
// not a `.test.` file gets bundled and typechecked by `convex dev`, which has
// no `import.meta.glob`. Root-anchored ("/convex/…", Vite's root is this
// package) because a relative glob keys same-directory files as "./x.ts",
// which convex-test then cannot map back to "waitlist/x".
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => await ctx.db.query("waitlist").collect());
}

describe("waitlist.join", () => {
  test("stores a normalised sign-up", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.waitlist.mutations.join, {
      email: "  Ada@Example.com ",
      name: " Ada ",
      instagram: "@ada.matches",
      source: "landing",
    });

    const [row] = await rows(t);
    expect(row).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      instagram: "ada.matches",
      source: "landing",
    });
  });

  test("treats blank optional fields as absent", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.waitlist.mutations.join, {
      email: "ada@example.com",
      name: "   ",
      instagram: "",
      source: "landing",
    });

    const [row] = await rows(t);
    expect(row.name).toBeUndefined();
    expect(row.instagram).toBeUndefined();
  });

  test("is idempotent on email and never overwrites", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.waitlist.mutations.join, {
      email: "ada@example.com",
      name: "Ada",
      source: "landing",
    });
    const repeat = await t.mutation(api.waitlist.mutations.join, {
      email: "ADA@example.com",
      name: "Someone Else",
      instagram: "ada.matches",
      source: "landing",
    });

    // Same response as a first sign-up: membership is not observable.
    expect(repeat).toBeNull();
    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "Ada", instagram: "ada.matches" });
  });

  test.each([
    ["no at-sign", { email: "ada.example.com" }],
    ["no domain dot", { email: "ada@example" }],
    ["too long", { email: `${"a".repeat(250)}@x.io` }],
    ["long name", { email: "ada@example.com", name: "a".repeat(101) }],
    ["bad handle", { email: "ada@example.com", instagram: "ada matches!" }],
  ])("rejects %s", async (_label, fields) => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.waitlist.mutations.join, { source: "landing", ...fields }),
    ).rejects.toThrow();
    expect(await rows(t)).toHaveLength(0);
  });
});

describe("waitlist.queries.list", () => {
  test("pages sign-ups newest first", async () => {
    const t = convexTest(schema, modules);
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      await t.mutation(api.waitlist.mutations.join, {
        email,
        source: "landing",
      });
    }

    const first = await t.query(internal.waitlist.queries.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((row) => row.email)).toEqual([
      "c@example.com",
      "b@example.com",
    ]);
    expect(first.isDone).toBe(false);
  });
});
