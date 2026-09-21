import type { Id } from "@repo/api";
import { describe, expect, test } from "vitest";
import {
  type BoardCard,
  cardReasons,
  cardsInStage,
  cardTitle,
  rejectionLine,
  responseLine,
  runSummary,
  scoreLine,
  scoreTone,
} from "./cards";

const person = (name: string) => ({
  candidateId: `c-${name}` as Id<"candidates">,
  name,
  email: `${name}@example.test`,
});

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    matchId: "m1" as Id<"matches">,
    a: person("Sam"),
    b: person("Jordan"),
    origin: "algorithm",
    stage: "suggested",
    stageChangedAt: 1_000,
    score: 82,
    coverage: 0.72,
    signals: [
      { key: "lookingFor", weight: 6, earned: 1, detail: "Both want marriage" },
      { key: "location", weight: 6, earned: 1, detail: "Both in Toronto" },
      { key: "age", weight: 3, earned: 0.8, detail: "34 and 31" },
      { key: "smoking", weight: 4, earned: 0, detail: "never and regularly" },
    ],
    ...over,
  };
}

describe("a card reads as both people", () => {
  test("named, in the stored order", () => {
    expect(cardTitle(card())).toBe("Sam and Jordan");
  });

  test("falling back to the email, as the candidate list does", () => {
    const anonymous = card({
      a: { candidateId: "c-x" as Id<"candidates">, email: "x@example.test" },
    });
    expect(cardTitle(anonymous)).toBe("x@example.test and Jordan");
  });
});

describe("the score", () => {
  test("reads with what it was based on", () => {
    expect(scoreLine(card())).toBe("82 — on a full profile");
  });

  test("is nothing at all for a pair nobody scored", () => {
    expect(
      scoreLine(card({ score: undefined, coverage: undefined })),
    ).toBeNull();
  });

  test("is drawn in three bands rather than a gradient", () => {
    expect(scoreTone(90)).toBe("strong");
    expect(scoreTone(70)).toBe("fair");
    expect(scoreTone(52)).toBe("thin");
    expect(scoreTone(undefined)).toBe("thin");
  });
});

describe("the reasons on a card", () => {
  test("lead with the strongest and keep the one that doesn't work", () => {
    const reasons = cardReasons(card());
    expect(reasons).toHaveLength(3);
    expect(reasons[0].detail).toBe("Both want marriage");
    const smoking = reasons.find((reason) => reason.key === "smoking");
    expect(smoking?.agrees).toBe(false);
    expect(smoking?.label).toBe("Smoking");
  });

  test("are empty for a card the algorithm never scored", () => {
    expect(cardReasons(card({ signals: undefined }))).toEqual([]);
  });
});

describe("a column's order", () => {
  test("Suggested is a shortlist: best first", () => {
    const cards = [
      card({ matchId: "low" as Id<"matches">, score: 55 }),
      card({ matchId: "high" as Id<"matches">, score: 91 }),
    ];
    expect(cardsInStage(cards, "suggested").map((one) => one.matchId)).toEqual([
      "high",
      "low",
    ]);
  });

  test("every other column is a queue: most recently moved first", () => {
    const cards = [
      card({
        matchId: "old" as Id<"matches">,
        stage: "reviewing",
        stageChangedAt: 1,
        score: 99,
      }),
      card({
        matchId: "new" as Id<"matches">,
        stage: "reviewing",
        stageChangedAt: 9,
        score: 51,
      }),
    ];
    expect(cardsInStage(cards, "reviewing").map((one) => one.matchId)).toEqual([
      "new",
      "old",
    ]);
  });

  test("a column only holds its own cards", () => {
    expect(cardsInStage([card()], "connected")).toEqual([]);
  });
});

describe("the sub-states", () => {
  test("an introduction says whose answer is missing", () => {
    expect(
      responseLine(
        card({
          stage: "introduced",
          candidateAResponse: "yes",
          candidateBResponse: "pending",
        }),
      ),
    ).toBe("Sam: Yes · Jordan: Waiting");
  });

  test("a card nobody has been introduced on says nothing", () => {
    expect(responseLine(card())).toBeNull();
  });

  test("a rejection names the person who made it, and why", () => {
    expect(
      rejectionLine(
        card({
          stage: "rejected",
          rejectedBy: "candidateA",
          rejectionReason: "Too far away.",
        }),
      ),
    ).toBe("Sam: Too far away.");
    expect(
      rejectionLine(
        card({
          stage: "rejected",
          rejectedBy: "matchmaker",
          rejectionReason: "Bad timing.",
        }),
      ),
    ).toBe("You: Bad timing.");
  });

  test("including the nightly run withdrawing its own suggestion", () => {
    expect(
      rejectionLine(
        card({
          stage: "rejected",
          rejectedBy: "system",
          rejectionReason: "The score fell to 41 on what's recorded now.",
        }),
      ),
    ).toContain("The nightly run");
  });

  test("and nothing at all on a card still on the board", () => {
    expect(rejectionLine(card())).toBeNull();
  });
});

describe("what a run just did", () => {
  const report = {
    considered: 12,
    pairs: 66,
    created: 4,
    rescored: 0,
    withdrawn: 0,
    heldBack: 0,
  };

  test("says what it looked at as well as what it found", () => {
    expect(runSummary(report)).toBe(
      "Looked at 12 profiles, 66 pairs · 4 new suggestions.",
    );
  });

  test("is explicit when it found nothing, because that means little on its own", () => {
    expect(runSummary({ ...report, created: 0 })).toContain(
      "nothing new to suggest",
    );
  });

  test("says so when there's nothing to work with rather than implying an opinion", () => {
    expect(runSummary({ ...report, considered: 1, pairs: 0 })).toContain(
      "at least two",
    );
  });

  test("mentions the cap, so a held-back pair isn't a lost one", () => {
    expect(runSummary({ ...report, heldBack: 7 })).toContain("held back");
  });

  test("and the corrections it made to its own earlier work", () => {
    expect(runSummary({ ...report, rescored: 2, withdrawn: 1 })).toContain(
      "2 rescored · 1 withdrawn",
    );
  });
});
