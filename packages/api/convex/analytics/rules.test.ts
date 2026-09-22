import { describe, expect, test } from "vitest";
import { AUDIT_ACTIONS } from "../audit/rules";
import {
  type AnalyticsAuditEvent,
  analyticsCapturesFor,
  batchUrl,
  posthogBatch,
} from "./rules";

const owner = { type: "user", userId: "u_owner", role: "matchmaker" } as const;

function event(overrides: Partial<AnalyticsAuditEvent>): AnalyticsAuditEvent {
  return {
    matchmakerId: "mm_1",
    candidateId: "c_1",
    actor: owner,
    action: "candidate.created",
    entity: { table: "candidates", id: "c_1" },
    ...overrides,
  };
}

describe("analyticsCapturesFor", () => {
  test("a person's action is sent under their account id, with their role", () => {
    expect(analyticsCapturesFor(event({}))).toEqual([
      {
        event: "candidate.created",
        distinctId: "u_owner",
        personless: false,
        properties: { actor_type: "user", actor_role: "matchmaker" },
      },
    ]);
  });

  test("an agent or a cron is sent without a person profile", () => {
    const [byAgent] = analyticsCapturesFor(
      event({
        action: "match.suggested",
        entity: { table: "matches", id: "m_1" },
        candidateId: "c_1",
        relatedEntityId: "c_2",
        actor: { type: "agent", agent: "conversation", model: "m-1" },
      }),
    );
    expect(byAgent).toMatchObject({
      distinctId: "agent:conversation",
      personless: true,
      properties: { actor_type: "agent", agent: "conversation", model: "m-1" },
    });

    const [byJob] = analyticsCapturesFor(
      event({
        action: "invite.expired",
        actor: { type: "system", job: "invite_expiry" },
      }),
    );
    expect(byJob).toMatchObject({
      distinctId: "system:invite_expiry",
      personless: true,
      properties: { actor_type: "system", job: "invite_expiry" },
    });
  });

  test("staff actions and the actions held back on #3 are not sent", () => {
    const admin = {
      type: "user",
      userId: "u_a",
      role: "platform_admin",
    } as const;
    expect(
      analyticsCapturesFor(event({ action: "invite.revoked", actor: admin })),
    ).toEqual([]);
    for (const action of [
      "account.erased",
      "candidate.anonymised",
      "membership.account_deleted",
      "ai_agent.updated",
      "candidate.details_changed",
    ] as const) {
      expect(analyticsCapturesFor(event({ action }))).toEqual([]);
    }
  });

  test("a match recorded on both trails is sent once", () => {
    const sides = [
      event({
        action: "match.created",
        entity: { table: "matches", id: "m_1" },
        candidateId: "c_1",
        relatedEntityId: "c_2",
      }),
      event({
        action: "match.created",
        entity: { table: "matches", id: "m_1" },
        candidateId: "c_2",
        relatedEntityId: "c_1",
      }),
    ];
    expect(sides.flatMap(analyticsCapturesFor)).toHaveLength(1);
  });

  test("a rename is sent from the account-level record only", () => {
    const account = event({
      action: "account.name_changed",
      matchmakerId: undefined,
      candidateId: undefined,
      entity: { table: "users", id: "u_owner" },
    });
    const fannedOut = event({
      action: "account.name_changed",
      entity: { table: "users", id: "u_owner" },
    });
    expect(analyticsCapturesFor(account)).toHaveLength(1);
    expect(analyticsCapturesFor(fannedOut)).toEqual([]);
  });

  test("closed-list values become properties; free text never does", () => {
    const [closed] = analyticsCapturesFor(
      event({
        action: "match.closed",
        entity: { table: "matches", id: "m_1" },
        candidateId: "c_1",
        relatedEntityId: "c_2",
        changes: [
          { field: "stage", before: "connected", after: "closed" },
          { field: "closedAs", after: "didnt_work" },
          { field: "closedBy", after: "candidateA" },
        ],
        reason: "She moved to Lisbon and he didn't want to follow.",
      }),
    );
    expect(closed?.properties).toEqual({
      actor_type: "user",
      actor_role: "matchmaker",
      outcome: "didnt_work",
      closed_by: "candidateA",
      has_note: true,
    });

    const [moved] = analyticsCapturesFor(
      event({
        action: "match.stage_changed",
        entity: { table: "matches", id: "m_1" },
        candidateId: "c_1",
        relatedEntityId: "c_2",
        // A value outside the list is dropped rather than forwarded.
        changes: [{ field: "stage", before: "proposed", after: "jane@x.test" }],
      }),
    );
    expect(moved?.properties).toEqual({
      actor_type: "user",
      actor_role: "matchmaker",
      from: "proposed",
    });

    const [status] = analyticsCapturesFor(
      event({
        action: "candidate.status_changed",
        changes: [{ field: "status", before: "active", after: "paused" }],
      }),
    );
    expect(status?.properties).toMatchObject({ from: "active", to: "paused" });
  });

  test("no audit value ever appears in what is sent", () => {
    const secret = "Jane Doe, jane@example.test, wants kids";
    const changes = [
      { field: "name", before: secret, after: secret },
      { field: "facts.wantsKids", before: secret, after: secret },
      { field: "email", after: secret },
    ];
    const sent = AUDIT_ACTIONS.flatMap((action) =>
      analyticsCapturesFor(
        event({ action, changes, reason: secret, matchmakerId: undefined }),
      ),
    );
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).not.toContain("jane");
    expect(JSON.stringify(sent)).not.toContain("Jane");
  });

  test("profile events are sent one per entry, with the entry's kind", () => {
    const captures = analyticsCapturesFor(
      event({
        action: "profile.suggested",
        entity: { table: "candidateProfiles", id: "p_1" },
        actor: { type: "agent", agent: "profile", model: "m-1" },
        changes: [
          { field: "facts.wantsKids", after: "yes" },
          { field: "facts.smoking", after: "never" },
          { field: "notes.idealWeekend", after: "Hiking, then a long lunch." },
        ],
      }),
    );
    expect(captures.map((c) => c.properties.kind)).toEqual([
      "facts",
      "facts",
      "notes",
    ]);
  });
});

describe("posthogBatch", () => {
  test("adds the distinct id, the workspace group and the personless flag", () => {
    const body = posthogBatch(
      "phc_test",
      [
        {
          event: "match.suggested",
          distinctId: "system:nightly",
          personless: true,
          properties: { actor_type: "system" },
        },
      ],
      { group: "maya", timestamp: Date.UTC(2026, 8, 22) },
    );
    expect(body).toEqual({
      api_key: "phc_test",
      batch: [
        {
          event: "match.suggested",
          timestamp: "2026-09-22T00:00:00.000Z",
          properties: {
            actor_type: "system",
            distinct_id: "system:nightly",
            $lib: "convex",
            $geoip_disable: true,
            $process_person_profile: false,
            $groups: { matchmaker: "maya" },
          },
        },
      ],
    });
  });

  test("leaves the group and flag out when they do not apply", () => {
    const [sent] = posthogBatch(
      "phc_test",
      [
        {
          event: "account.created",
          distinctId: "u_1",
          personless: false,
          properties: {},
        },
      ],
      { timestamp: 0 },
    ).batch;
    expect(sent?.properties).toEqual({
      distinct_id: "u_1",
      $lib: "convex",
      $geoip_disable: true,
    });
  });
});

describe("batchUrl", () => {
  test("defaults to PostHog US and tolerates a trailing slash", () => {
    expect(batchUrl(undefined)).toBe("https://us.i.posthog.com/batch/");
    expect(batchUrl("")).toBe("https://us.i.posthog.com/batch/");
    expect(batchUrl("https://eu.i.posthog.com/")).toBe(
      "https://eu.i.posthog.com/batch/",
    );
  });
});
