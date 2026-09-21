/**
 * Per-spec-file test data: the shape of a "scenario", written by
 * `./mutations.ts` and asked for by `apps/e2e/scenario.ts`.
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
 * Plain data with no Convex imports: `apps/e2e` imports these types directly.
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
  businessName?: string;
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

export type ScenarioSpec = {
  /** 4–12 lowercase letters and digits, starting with a letter. */
  ns: string;
  users?: ScenarioUser[];
  matchmakers?: ScenarioMatchmaker[];
  candidates?: ScenarioCandidate[];
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
