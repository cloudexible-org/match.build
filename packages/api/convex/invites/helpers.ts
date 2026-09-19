import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { type AuditActor, recordAudit } from "../audit/helpers";
import {
  INVITE_EXPIRY_HOP_MS,
  INVITE_SEND_WINDOW_MS,
  INVITE_SENDS_PER_DAY,
  INVITE_TTL_MS,
} from "./rules";

/**
 * Invite link tokens (prd/phase-1.md §3.2).
 *
 * The token is never stored. Each invite gets a random `nonce`, and the token
 * is HMAC-SHA256(INVITE_LINK_SECRET, candidateId + nonce). The candidate row
 * keeps the nonce and the token's SHA-256 (`tokenHash`), which is what an
 * opened link is looked up by. So:
 *
 * - the owner can copy the same link again at any time (re-derive it);
 * - the database alone can't produce a working link: that needs the secret;
 * - issuing a new nonce (resend with a new email, re-invite) changes the
 *   token and the hash together, which is what kills the old link.
 */

export type Invite = NonNullable<Doc<"candidates">["invite"]>;

/** The token for one issue of one candidate's invite. Base64url, 43 chars. */
export async function deriveInviteToken(
  secret: string,
  candidateId: string,
  nonce: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`invite:v1:${candidateId}:${nonce}`),
  );
  return base64url(new Uint8Array(signature));
}

/** SHA-256 of a token, hex. Stored as `invite.tokenHash`. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function inviteSecret(): string {
  const secret = env.INVITE_LINK_SECRET;
  if (!secret) {
    throw new ConvexError(
      "Invite links aren't set up on this deployment yet (INVITE_LINK_SECRET).",
    );
  }
  return secret;
}

/**
 * A fresh invite for a candidate: a new nonce, its token's hash, and an
 * expiry 30 days from `now`. The caller writes it to the candidate row (and
 * audits it) in the same mutation.
 */
export async function newInvite(
  candidateId: string,
  now: number,
): Promise<Invite> {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const token = await deriveInviteToken(inviteSecret(), candidateId, nonce);
  return {
    tokenHash: await hashInviteToken(token),
    nonce,
    expiresAt: now + INVITE_TTL_MS,
  };
}

/**
 * The token of a candidate's open invite, re-derived for the owner to copy,
 * or `null` when there is no open invite or it predates copyable links.
 */
export async function currentInviteToken(
  candidate: Doc<"candidates">,
): Promise<string | null> {
  const nonce = candidate.invite?.nonce;
  if (nonce === undefined) return null;
  return await inviteTokenFor(candidate._id, nonce);
}

/** The token for one issue of an invite, under this deployment's secret. */
export async function inviteTokenFor(
  candidateId: string,
  nonce: string,
): Promise<string> {
  return await deriveInviteToken(inviteSecret(), candidateId, nonce);
}

/**
 * Opens a fresh invite on a candidate: writes it, and schedules its expiry
 * 30 days out. The expiry job only clears this exact invite (matched by
 * hash), so a later reissue is never expired early. The caller audits it.
 */
export async function openInvite(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
  now: number,
): Promise<Invite> {
  const invite = await newInvite(candidateId, now);
  await ctx.db.patch("candidates", candidateId, { invite });
  await scheduleExpiry(ctx, candidateId, invite, now);
  return invite;
}

/**
 * Schedules the expiry check for an invite: at `expiresAt`, or one hop
 * (`INVITE_EXPIRY_HOP_MS`) sooner, after which the job schedules the next.
 */
export async function scheduleExpiry(
  ctx: MutationCtx,
  candidateId: Id<"candidates">,
  invite: Invite,
  now: number,
): Promise<void> {
  await ctx.scheduler.runAt(
    Math.min(invite.expiresAt, now + INVITE_EXPIRY_HOP_MS),
    internal.invites.mutations.expire,
    { candidateId, tokenHash: invite.tokenHash },
  );
}

/**
 * Sends the open invite's email: schedules the action that sends it, stamps
 * `lastSentAt`, and audits it as `invite.sent` (the first email for this
 * invite) or `invite.resent`. The token is re-derived inside the action, so
 * it never sits in a scheduled function's arguments.
 */
export async function sendInvite(
  ctx: MutationCtx,
  args: {
    candidate: Doc<"candidates">;
    invite: Invite;
    actor: AuditActor;
    action: "invite.sent" | "invite.resent";
    now: number;
  },
): Promise<void> {
  const { candidate, invite } = args;
  await ctx.scheduler.runAfter(0, internal.invites.actions.sendEmail, {
    candidateId: candidate._id,
    tokenHash: invite.tokenHash,
  });
  await ctx.db.patch("candidates", candidate._id, {
    invite: { ...invite, lastSentAt: args.now },
  });
  await recordAudit(ctx, {
    matchmakerId: candidate.matchmakerId,
    candidateId: candidate._id,
    actor: args.actor,
    action: args.action,
    entity: { table: "candidates", id: candidate._id },
    changes: [{ field: "email", after: candidate.email }],
  });
}

// Far more than the send limit; only the last day's events matter.
const RECENT_EVENTS = 50;

/**
 * Throws unless the candidate's invite email may be sent again now: at most
 * `INVITE_SENDS_PER_DAY` sends in any rolling day. Counted from the audit
 * trail, which records every send; a mutation is serialisable, so two
 * concurrent resends can't both slip under the limit.
 */
export async function assertCanSendInvite(
  ctx: QueryCtx,
  candidateId: Id<"candidates">,
  now: number,
): Promise<void> {
  const events = await ctx.db
    .query("auditEvents")
    .withIndex("by_entityTable_and_entityId", (q) =>
      q.eq("entityTable", "candidates").eq("entityId", candidateId),
    )
    .order("desc")
    .take(RECENT_EVENTS);
  const sends = events.filter(
    (event) =>
      (event.action === "invite.sent" || event.action === "invite.resent") &&
      event._creationTime > now - INVITE_SEND_WINDOW_MS,
  );
  if (sends.length >= INVITE_SENDS_PER_DAY) {
    throw new ConvexError(
      `This invitation has been emailed ${INVITE_SENDS_PER_DAY} times today. Try again tomorrow, or copy the link instead.`,
    );
  }
}

/** How the person opening an invite asked for it. */
export type InviteRef = { token?: string; candidateId?: string };

/**
 * The candidate an invite reference points at, if its invite is open and the
 * signed-in user may answer it:
 *
 * - by **token** (the link): any signed-in account (prd §3.2 — rescues typos
 *   and second addresses);
 * - by **candidateId** (the home page): only an account whose verified email
 *   is the invited one.
 *
 * Unknown, used, revoked and expired invites all answer `null`, so a link
 * reveals nothing once it's dead.
 */
export async function resolveInvite(
  ctx: QueryCtx,
  user: Doc<"users">,
  ref: InviteRef,
): Promise<Doc<"candidates"> | null> {
  let candidate: Doc<"candidates"> | null = null;
  if (ref.token !== undefined) {
    const tokenHash = await hashInviteToken(ref.token);
    candidate = await ctx.db
      .query("candidates")
      .withIndex("by_invite_tokenHash", (q) =>
        q.eq("invite.tokenHash", tokenHash),
      )
      .unique();
  } else if (ref.candidateId !== undefined) {
    const id = ctx.db.normalizeId("candidates", ref.candidateId);
    candidate = id === null ? null : await ctx.db.get("candidates", id);
    const verifiedEmail =
      user.emailVerificationTime !== undefined ? user.email : undefined;
    if (candidate !== null && candidate.email !== verifiedEmail) {
      candidate = null;
    }
  }
  if (
    candidate === null ||
    candidate.invite === undefined ||
    candidate.membership !== "invited"
  ) {
    return null;
  }
  return candidate;
}

export type InviteProblem = "own_profile" | "already_member" | "other_history";

/**
 * Why this account can't accept this invite, or `null` when it can. The
 * invite stays open either way (prd §3.2).
 *
 * - `own_profile`: the account owns the inviting matchmaker profile.
 * - `already_member`: the account is already a joined candidate there.
 * - `other_history`: the account is linked to a different, former candidate
 *   record with this matchmaker (left, or deleted). Accepting would give one
 *   person two records in one book; the matchmaker re-invites that record
 *   instead.
 */
export async function inviteProblem(
  ctx: QueryCtx,
  user: Doc<"users">,
  candidate: Doc<"candidates">,
): Promise<InviteProblem | null> {
  const matchmaker = await ctx.db.get("matchmakers", candidate.matchmakerId);
  if (matchmaker?.ownerUserId === user._id) return "own_profile";
  const linked = await ctx.db
    .query("candidates")
    .withIndex("by_userId_and_matchmakerId", (q) =>
      q.eq("userId", user._id).eq("matchmakerId", candidate.matchmakerId),
    )
    .take(10);
  for (const other of linked) {
    if (other._id === candidate._id) continue;
    return other.membership === "joined" ? "already_member" : "other_history";
  }
  return null;
}

export const INVITE_PROBLEM_MESSAGES: Record<InviteProblem, string> = {
  own_profile: "This invitation is from your own matchmaker profile.",
  already_member: "You're already a member of this matchmaker.",
  other_history:
    "You already have a history with this matchmaker. Ask them to re-invite you.",
};

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
