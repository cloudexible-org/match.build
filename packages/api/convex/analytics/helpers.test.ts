/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import type { PostHogBatchBody } from "./rules";

// See waitlist/mutations.test.ts for why the glob is inline and root-anchored.
const modules = import.meta.glob([
  "/convex/**/*.*s",
  "!/convex/**/*.test.*",
  "!/convex/**/*.d.ts",
]);

/**
 * The emitter end to end: a real mutation records an audit event, the
 * scheduled action runs, and what reaches `fetch` is what PostHog would get.
 */

const sent: { url: string; body: PostHogBatchBody }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) as PostHogBatchBody });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: "maya@example.test" });
    const matchmakerId = await ctx.db.insert("matchmakers", {
      ownerUserId: owner,
      username: "maya",
      usernameKey: "maya",
      displayName: "Maya",
    });
    const candidate = (name: string) =>
      ctx.db.insert("candidates", {
        matchmakerId,
        name,
        email: `${name}@example.test`,
        socialHandles: [],
        membership: "joined",
        membershipChangedAt: 1,
        status: "active",
      });
    return {
      owner,
      matchmakerId,
      sam: await candidate("sam"),
      jordan: await candidate("jordan"),
    };
  });
  return { t, ...ids, asOwner: t.withIdentity({ subject: `${ids.owner}|s` }) };
}

async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("emitAuditAnalytics", () => {
  test("an audited change reaches PostHog, grouped under the workspace", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    const w = await world();
    await w.asOwner.mutation(api.candidates.mutations.setStatus, {
      matchmakerId: w.matchmakerId,
      candidateId: w.sam,
      status: "paused",
    });
    await flush(w.t);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://us.i.posthog.com/batch/");
    expect(sent[0]?.body.api_key).toBe("phc_test");
    expect(sent[0]?.body.batch).toEqual([
      {
        event: "candidate.status_changed",
        timestamp: expect.any(String),
        properties: {
          actor_type: "user",
          actor_role: "matchmaker",
          from: "active",
          to: "paused",
          distinct_id: w.owner,
          $lib: "convex",
          $geoip_disable: true,
          $groups: { matchmaker: "maya" },
        },
      },
    ]);
  });

  test("a match, recorded on both candidates' trails, is sent once", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com/");
    const w = await world();
    await w.asOwner.mutation(api.matches.mutations.create, {
      matchmakerId: w.matchmakerId,
      candidateAId: w.sam,
      candidateBId: w.jordan,
    });
    await flush(w.t);

    const events = sent.flatMap((request) => request.body.batch);
    expect(events.map((e) => e.event)).toEqual(["match.created"]);
    expect(sent[0]?.url).toBe("https://eu.i.posthog.com/batch/");
    // Neither candidate's id, nor anything about them, leaves.
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain(w.sam);
    expect(wire).not.toContain(w.jordan);
    expect(wire).not.toContain("example.test");
  });

  test("without a key nothing is scheduled at all", async () => {
    const w = await world();
    await w.asOwner.mutation(api.candidates.mutations.setStatus, {
      matchmakerId: w.matchmakerId,
      candidateId: w.sam,
      status: "paused",
    });
    const scheduled = await w.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toEqual([]);
    await flush(w.t);
    expect(sent).toEqual([]);
  });
});
