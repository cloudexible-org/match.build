/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

async function world() {
  const t = convexTest(schema, modules);
  const { owner, stranger } = await t.run(async (ctx) => ({
    owner: await ctx.db.insert("users", { email: "owner@example.test" }),
    stranger: await ctx.db.insert("users", { email: "stranger@example.test" }),
  }));
  const asOwner = t.withIdentity({ subject: `${owner}|s` });
  const { matchmakerId } = await asOwner.mutation(
    api.matchmakers.mutations.create,
    { username: "jane.smith", displayName: "Jane" },
  );
  return {
    t,
    asOwner,
    asStranger: t.withIdentity({ subject: `${stranger}|s` }),
    matchmakerId,
  };
}

describe("matchmakers.workspace", () => {
  test("finds the owner's profile under any case or dot placement", async () => {
    const { asOwner, matchmakerId } = await world();
    for (const username of ["jane.smith", "JaneSmith", "j.anesmith"]) {
      expect(
        await asOwner.query(api.matchmakers.queries.workspace, { username }),
      ).toEqual({
        matchmakerId,
        username: "jane.smith",
        displayName: "Jane",
        businessName: undefined,
      });
    }
  });

  test("answers null alike for someone else's profile, an unknown one, and signed-out callers", async () => {
    const { t, asStranger, asOwner } = await world();
    const workspace = api.matchmakers.queries.workspace;
    expect(
      await asStranger.query(workspace, { username: "jane.smith" }),
    ).toBeNull();
    expect(
      await asOwner.query(workspace, { username: "nobody.here" }),
    ).toBeNull();
    expect(await asOwner.query(workspace, { username: "..." })).toBeNull();
    expect(await t.query(workspace, { username: "jane.smith" })).toBeNull();
  });
});
