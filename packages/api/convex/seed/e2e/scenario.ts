/**
 * Per-spec-file test data: the shape of a "scenario", written by
 * `./mutations.ts` and asked for by `tooling/harness/scenario.ts`.
 *
 * ─── Why scenarios exist ────────────────────────────────────────────────────
 *
 * The baseline seed (`./fixture.ts`) is one world shared by the whole run, so
 * nothing may change it. A scenario is the opposite: each spec file asks for
 * its own accounts, profiles, candidates and threads, under a namespace
 * (`ns`) unique to that file and run. Nothing else in the suite can see them,
 * so a file can write freely without affecting another — whatever order the
 * files run in, however many run at once.
 *
 * It also reaches states the UI can't produce quickly, or at all: a candidate
 * who left last month, an invite that has expired, an invitation already
 * emailed three times today.
 *
 * Plain data with no Convex imports: `tooling/harness` imports these types
 * directly.
 */

export type ScenarioMembership =
  | "invited"
  | "declined"
  | "joined"
  | "left"
  | "account_deleted";

export type ScenarioStatus = "active" | "paused" | "archived";

export type ScenarioPlatform =
  | "instagram"
  | "whatsapp"
  | "tiktok"
  | "facebook"
  | "x"
  | "linkedin"
  | "other";

/** `open` and `expired` both produce a real, copyable link. */
export type ScenarioInvite = "open" | "expired" | "none";

export type ScenarioMessage = {
  author: "matchmaker" | "candidate" | "system";
  /** Default: "everyone". "matchmaker" is a private message. */
  visibility?: "everyone" | "matchmaker";
  /** Default: "typed" ("imported" for a pasted history). */
  source?: "typed" | "imported" | "system";
  body: string;
};

export type ScenarioUser = {
  key: string;
  /** Default: `<key>.<ns>@matchmaker-e2e.test`. Always namespaced. */
  email?: string;
  /** Default: the key, capitalised. */
  name?: string;
  /** Default: true. A verified address can claim invitations to it. */
  verified?: boolean;
  /** Marks the account deleted (`users.deletedAt`). */
  deleted?: boolean;
  /**
   * Registers a browser for web push at this endpoint, with the receiver keys
   * from RFC 8291's test vector. Reaches a state the UI can't: a real
   * subscription needs a real browser and a real push service.
   */
  pushEndpoint?: string;
};

export type ScenarioMatchmaker = {
  key: string;
  ownerKey: string;
  /** Default: `<ns>.<key>`, which passes the username rules. */
  username?: string;
  /** Default: `<Key> <ns>`, so it can't collide in an assertion. */
  displayName?: string;
  /** Their voice (prd/phase-2.md §4.1C), as if they had written it themselves. */
  voice?: string;
  /** A voice the agent has drafted and nobody has answered yet. */
  voiceSuggestion?: string;
};

export type ScenarioCandidate = {
  key: string;
  matchmakerKey: string;
  /** The account behind them. Required for `joined`. */
  userKey?: string;
  /** Default: the linked account's, else `<key>.<ns>@matchmaker-e2e.test`. */
  email?: string;
  /** The matchmaker's own label for them. */
  name?: string;
  /** Default: "invited". */
  membership?: ScenarioMembership;
  /** Default: "active". */
  status?: ScenarioStatus;
  socialHandles?: { platform: ScenarioPlatform; handle: string }[];
  /** Default: "open" while invited, "none" otherwise. */
  invite?: ScenarioInvite;
  /** How many days ago the membership last changed. Default: 0. */
  membershipChangedDaysAgo?: number;
  /** The reason they gave for leaving, for a `left` candidate. */
  leaveReason?: string;
  /**
   * Invite emails already recorded as sent today, for the resend limit
   * (`invites/helpers.ts`, three a day).
   */
  invitesSentToday?: number;
  /** Oldest first. The conversation's counters follow them. */
  messages?: ScenarioMessage[];
  /** Left unread by the matchmaker, as if the candidate had just written. */
  unreadForMatchmaker?: boolean;
  /**
   * The matchmaker's profile of them (prd/phase-2.md §3). `facts` are keyed by
   * the registry in `profiles/rules.ts` and their values have to pass its
   * validation; `notes` take any key. `suggestions` reach a state the UI can't
   * produce without an agent: a value an agent has proposed and nobody has
   * answered yet.
   */
  profile?: ScenarioProfile;
  /**
   * Replies the assistant has drafted and nobody has answered
   * (prd/phase-2.md §4A) — a state this suite cannot otherwise reach, because
   * the gateway needs a paid Convex Cloud deployment and the e2e backend is a
   * local anonymous one. Newest last; they show above the composer.
   */
  replyDrafts?: string[];
};

export type ScenarioProfile = {
  facts?: Record<string, string>;
  notes?: Record<string, string>;
  suggestions?: {
    kind: "facts" | "notes";
    key: string;
    value: string;
    /** Default: the agent wrote nothing here before. */
    current?: string;
    /** The agent proposing the entry go, rather than a new value. */
    remove?: boolean;
    /**
     * The candidate's own words behind it, quoted under the proposal so a
     * matchmaker can check it rather than take it on trust.
     */
    quote?: string;
  }[];
};

/**
 * A card on the match board (prd/phase-3.md §2), written straight into the
 * stage it should be in. The nightly run can only ever produce `suggested`, so
 * a spec that wants to assert on a card halfway along the board has no way to
 * get there except through the UI it is testing.
 *
 * `score` and `signals` are the run's arithmetic, seeded rather than computed:
 * a spec asserting "82" against a card should fail when the *board* stops
 * showing scores, not when the weights in `matches/rules.ts` are retuned.
 */
export type ScenarioMatch = {
  key: string;
  matchmakerKey: string;
  /** Candidate keys. Stored in the table's own order, whichever way round. */
  aKey: string;
  bKey: string;
  /** Default: "proposed". */
  stage?: ScenarioMatchStage;
  /** Default: "algorithm". */
  origin?: "algorithm" | "manual";
  score?: number;
  coverage?: number;
  signals?: { key: string; weight: number; earned: number; detail: string }[];
  checkDealbreakers?: boolean;
  /** What closing recorded. Only meaningful on a `closed` card. */
  closedAs?: "together" | "didnt_work";
  closedBy?: "matchmaker" | "candidateA" | "candidateB" | "both" | "system";
  closingNote?: string;
  /**
   * Whether the matchmaker has looked at it. Default: true at every stage but
   * `proposed`, since a card they moved is a card they saw.
   */
  seen?: boolean;
  /** How many days ago the card last moved. Default: 0. */
  stageChangedDaysAgo?: number;
};

export type ScenarioMatchStage =
  | "proposed"
  | "introduced"
  | "connected"
  | "closed";

/**
 * A generation that was already paid for, and what it cost — a state the suite
 * cannot otherwise reach at all: the Convex AI gateway needs a paid Cloud
 * deployment and the e2e backend is a local anonymous one, so no spec can make
 * a real model call.
 *
 * `model` should carry the namespace (`aiModel(ns)`), because `aiGenerations`
 * and `aiModelRates` are global — the usage page adds up the whole deployment —
 * and a model id nobody else uses is what makes an assertion about a row exact
 * while other spec files run beside it.
 */
export type ScenarioGeneration = {
  agent: "conversation" | "candidate_profile" | "voice_profile";
  model: string;
  /** Whose book it is on. Omit for a call with no tenant, like a probe. */
  matchmakerKey?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** How many UTC days back it happened. Default: 0, today. */
  daysAgo?: number;
  /**
   * What the model costs while this generation is written, in dollars per
   * million tokens. Given on any generation for a model, it prices every one of
   * them and leaves the rate behind for the page's rate editor to show.
   */
  rate?: { inputUsdPerMillion: number; outputUsdPerMillion: number };
};

export type ScenarioSpec = {
  /** 4–12 lowercase letters and digits, starting with a letter. */
  ns: string;
  users?: ScenarioUser[];
  matchmakers?: ScenarioMatchmaker[];
  candidates?: ScenarioCandidate[];
  matches?: ScenarioMatch[];
  generations?: ScenarioGeneration[];
};

export type ScenarioManifest = {
  ns: string;
  users: Record<string, { id: string; email: string; name: string }>;
  matchmakers: Record<
    string,
    { id: string; username: string; displayName: string }
  >;
  candidates: Record<
    string,
    {
      id: string;
      email: string;
      conversationId: string;
      /** The real invite link token, when the candidate has an invite. */
      inviteToken: string | null;
    }
  >;
  matches: Record<string, { id: string }>;
};

/** Namespaces are part of emails and usernames, so keep them URL- and rule-safe. */
export const NS_PATTERN = /^[a-z][a-z0-9]{3,11}$/;

export const SCENARIO_EMAIL_DOMAIN = "matchmaker-e2e.test";

export function scenarioEmail(key: string, ns: string): string {
  return `${key}.${ns}@${SCENARIO_EMAIL_DOMAIN}`;
}

export function scenarioUsername(key: string, ns: string): string {
  return `${ns}.${key}`;
}

export function scenarioName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * A model id private to one scenario, in the shape the gateway names models.
 * `aiGenerations` and `aiModelRates` are global, so this is what lets a spec
 * assert on its own rows while another file's are in the same totals.
 */
export function scenarioAiModel(ns: string): string {
  return `e2e/${ns}-model`;
}
