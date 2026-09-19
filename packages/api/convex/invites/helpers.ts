import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import { INVITE_TTL_MS } from "./rules";

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
  return await deriveInviteToken(inviteSecret(), candidate._id, nonce);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
