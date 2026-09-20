import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  nextPushAt,
  notificationDelays,
  skipScheduling,
} from "./rules";

/*
 * ─── Web push crypto ────────────────────────────────────────────────────────
 *
 * Push messages are encrypted end to end: the push service (Apple, Google,
 * Mozilla) forwards bytes it cannot read to a browser that can. Two RFCs:
 *
 *   RFC 8291 — the `aes128gcm` payload, keyed by an ECDH exchange with the
 *              browser's subscription key and the client's auth secret.
 *   RFC 8292 — VAPID: an ES256 JWT that identifies *us* to the push service.
 *
 * Both are done here with Web Crypto rather than the `web-push` package, so
 * sending stays in Convex's own runtime instead of needing a `"use node"`
 * action. `encryptPushPayload` takes its ephemeral keypair and salt as
 * optional arguments purely so the RFC's own test vector can be replayed
 * against it (helpers.test.ts), which is what proves this is right — nothing
 * on the send path passes them.
 */

/**
 * Bytes backed by a plain `ArrayBuffer`. Web Crypto's `BufferSource` rejects
 * the `SharedArrayBuffer`-permitting default that `Uint8Array` now widens to,
 * so every buffer here is this.
 */
type Bytes = Uint8Array<ArrayBuffer>;

/** The record size in the aes128gcm header. Bigger than any payload we send. */
const RECORD_SIZE = 4096;

/** VAPID JWTs are short-lived; the spec allows at most 24 hours. */
const VAPID_TTL_SECONDS = 12 * 60 * 60;

/** How long a push service should hold an undelivered message. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

export type PushSubscription = {
  endpoint: string;
  /** The browser's public key, base64url (65-byte uncompressed P-256 point). */
  p256dh: string;
  /** The browser's 16-byte auth secret, base64url. */
  auth: string;
};

/**
 * The encrypted body to POST to a push endpoint, as
 * `Content-Encoding: aes128gcm`:
 *
 *   salt(16) | record size(4) | key id length(1) | our public key(65) | ciphertext
 */
export async function encryptPushPayload(
  subscription: Pick<PushSubscription, "p256dh" | "auth">,
  payload: string,
  testOnly?: { salt: Bytes; keyPair: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = fromBase64url(subscription.p256dh);
  const authSecret = fromBase64url(subscription.auth);
  const salt =
    testOnly?.salt ?? (crypto.getRandomValues(new Uint8Array(16)) as Bytes);

  const ours = testOnly?.keyPair ?? (await generateEcdhKeyPair());
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", ours.publicKey),
  ) as Bytes;

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: await crypto.subtle.importKey(
          "raw",
          uaPublic,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          [],
        ),
      },
      ours.privateKey,
      256,
    ),
  ) as Bytes;

  // RFC 8291 §3.3: the auth secret salts the first extract, and the info
  // string binds the derived key to both public keys, so a key from one
  // subscription can never decrypt another's.
  const authPrk = await hkdfExtract(authSecret, sharedSecret);
  const ikm = await hkdfExpand(
    authPrk,
    concat(
      utf8("WebPush: info"),
      Uint8Array.of(0) as Bytes,
      uaPublic,
      asPublic,
    ),
    32,
  );
  const prk = await hkdfExtract(salt, ikm);
  const key = await hkdfExpand(
    prk,
    concat(utf8("Content-Encoding: aes128gcm"), Uint8Array.of(0) as Bytes),
    16,
  );
  const nonce = await hkdfExpand(
    prk,
    concat(utf8("Content-Encoding: nonce"), Uint8Array.of(0) as Bytes),
    12,
  );

  // One record, so its padding delimiter is 0x02 (RFC 8188 §2).
  const plaintext = concat(utf8(payload), Uint8Array.of(2) as Bytes);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]),
      plaintext,
    ),
  ) as Bytes;

  const recordSize = new Uint8Array(4) as Bytes;
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);
  return concat(
    salt,
    recordSize,
    Uint8Array.of(asPublic.length) as Bytes,
    asPublic,
    ciphertext,
  );
}

/**
 * The `Authorization` header that identifies this deployment to a push
 * service (RFC 8292): an ES256 JWT for the endpoint's origin, plus our VAPID
 * public key. Throws when the deployment has no keys — the caller checks
 * first, so reaching this means push was scheduled on a deployment that can't
 * send it.
 */
export async function vapidAuthorization(
  endpoint: string,
  now: number,
): Promise<string> {
  const keys = vapidKeys();
  if (keys === null) {
    throw new Error("Web push is not set up on this deployment (VAPID keys).");
  }
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + VAPID_TTL_SECONDS,
    sub: keys.subject,
  };
  const signingInput = `${toBase64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${toBase64url(utf8(JSON.stringify(claims)))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await importVapidSigningKey(keys.publicKey, keys.privateKey),
      utf8(signingInput),
    ),
  ) as Bytes;
  return `vapid t=${signingInput}.${toBase64url(signature)}, k=${keys.publicKeyBase64url}`;
}

/** This deployment's VAPID keys, or `null` when push isn't set up. */
export function vapidKeys(): {
  publicKey: Bytes;
  privateKey: Bytes;
  publicKeyBase64url: string;
  subject: string;
} | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // A push service needs a way to reach whoever is sending. The site URL is a
  // reasonable default; `mailto:` is the other accepted form.
  const subject = env.VAPID_SUBJECT || env.SITE_URL;
  if (!subject) return null;
  return {
    publicKey: fromBase64url(publicKey),
    privateKey: fromBase64url(privateKey),
    publicKeyBase64url: publicKey,
    subject,
  };
}

/**
 * The VAPID signing key as Web Crypto wants it. The stored form is what every
 * web-push tool uses — the raw 32-byte scalar and the 65-byte uncompressed
 * point — so the JWK is assembled from both halves here.
 */
async function importVapidSigningKey(
  publicKey: Bytes,
  privateKey: Bytes,
): Promise<CryptoKey> {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY is not an uncompressed P-256 point.");
  }
  return await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: toBase64url(publicKey.subarray(1, 33)),
      y: toBase64url(publicKey.subarray(33, 65)),
      d: toBase64url(privateKey),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
}

async function hkdfExtract(salt: Bytes, ikm: Bytes): Promise<Bytes> {
  return await hmacSha256(salt, ikm);
}

async function hkdfExpand(
  prk: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  // Every output here is at most 32 bytes, so one HMAC round is enough.
  const block = await hmacSha256(prk, concat(info, Uint8Array.of(1) as Bytes));
  return new Uint8Array(block.subarray(0, length)) as Bytes;
}

async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, data),
  ) as Bytes;
}

function concat(...parts: Bytes[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total) as Bytes;
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const utf8 = (text: string): Bytes => new TextEncoder().encode(text) as Bytes;

export function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64url(text: string): Bytes {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)) as Bytes;
}

/*
 * ─── Deciding who to tell, and when ─────────────────────────────────────────
 */

/**
 * A recipient's own settings, or the defaults for an account that has none.
 *
 * Returns just the two flags, never the stored document: callers hand this
 * straight to a query's return value, and a document's `_id`, `_creationTime`
 * and `userId` would fail their validators (and leak a row id).
 */
export async function notificationSettingsFor(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ emailEnabled: boolean; pushEnabled: boolean }> {
  const stored = await ctx.db
    .query("notificationSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (stored === null) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  return {
    emailEnabled: stored.emailEnabled,
    pushEnabled: stored.pushEnabled,
  };
}

/** Which side of a conversation a user is on, for reading their marker. */
export type Side = "matchmaker" | "candidate";

export function readSeqFor(
  conversation: Doc<"conversations">,
  side: Side,
): number {
  return side === "matchmaker"
    ? conversation.matchmakerLastReadSeq
    : conversation.candidateLastReadSeq;
}

/**
 * Who should be told about a new message, or `null` when nobody should be
 * (prd/phase-1.md §8.1):
 *
 * - a **private** message is only ever visible to the matchmaker, who wrote
 *   it, so it notifies no one — this is the rule that keeps an imported DM
 *   history or a system note from pinging the candidate;
 * - a **system** message has no other party to tell;
 * - a candidate is only notified while their membership is `joined`, and only
 *   once an account is linked to them at all.
 */
export async function messageRecipient(
  ctx: QueryCtx,
  args: {
    candidate: Doc<"candidates">;
    author: "matchmaker" | "candidate" | "system";
    visibility: "everyone" | "matchmaker";
  },
): Promise<{ userId: Id<"users">; side: Side } | null> {
  if (args.visibility !== "everyone" || args.author === "system") return null;
  if (args.author === "matchmaker") {
    if (
      args.candidate.userId === undefined ||
      args.candidate.membership !== "joined"
    ) {
      return null;
    }
    return { userId: args.candidate.userId, side: "candidate" };
  }
  const matchmaker = await ctx.db.get(
    "matchmakers",
    args.candidate.matchmakerId,
  );
  if (matchmaker === null) return null;
  return { userId: matchmaker.ownerUserId, side: "matchmaker" };
}

/**
 * Schedules whatever notification a new message calls for (prd §8.1).
 *
 * One row per (conversation, recipient, channel), so at most one job per
 * channel is ever pending: a later message bumps the pending job's
 * `triggerSeq` and rides on it rather than scheduling a second. Both channels
 * are scheduled hopefully — whether they actually send is decided when the job
 * fires and re-reads the read markers, never here.
 *
 * `conversation` is the row as it was **before** the message was appended,
 * which is what the caller has to hand. That is safe: appending only moves the
 * *sender's* read marker, and the only marker read here is the recipient's.
 */
export async function scheduleMessageNotifications(
  ctx: MutationCtx,
  args: {
    conversation: Doc<"conversations">;
    candidate: Doc<"candidates">;
    author: "matchmaker" | "candidate" | "system";
    visibility: "everyone" | "matchmaker";
    seq: number;
    now: number;
  },
): Promise<void> {
  const recipient = await messageRecipient(ctx, args);
  if (recipient === null) return;
  const readSeq = readSeqFor(args.conversation, recipient.side);
  const delays = notificationDelays(
    env.NOTIFICATION_PUSH_DELAY_SECONDS,
    env.NOTIFICATION_EMAIL_DELAY_SECONDS,
  );

  for (const channel of ["push", "email"] as const) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_conversationId_and_userId_and_channel", (q) =>
        q
          .eq("conversationId", args.conversation._id)
          .eq("userId", recipient.userId)
          .eq("channel", channel),
      )
      .unique();

    const skip = skipScheduling({
      channel,
      existing: existing ?? undefined,
      readSeq,
    });
    if (skip === "unread_email") continue;
    if (skip === "pending") {
      // Ride the pending job: it will ask about this message instead.
      if (existing !== null && existing.triggerSeq < args.seq) {
        await ctx.db.patch("notifications", existing._id, {
          triggerSeq: args.seq,
        });
      }
      continue;
    }

    const scheduledFor =
      channel === "push"
        ? nextPushAt(args.now, existing?.sentAt, delays.pushMs)
        : args.now + delays.emailMs;
    const notificationId =
      existing === null
        ? await ctx.db.insert("notifications", {
            userId: recipient.userId,
            conversationId: args.conversation._id,
            channel,
            triggerSeq: args.seq,
            status: "scheduled",
            scheduledFor,
          })
        : existing._id;
    if (existing !== null) {
      await ctx.db.patch("notifications", existing._id, {
        triggerSeq: args.seq,
        status: "scheduled",
        scheduledFor,
        sentAt: undefined,
      });
    }
    await ctx.scheduler.runAt(
      scheduledFor,
      internal.notifications.mutations.deliver,
      { notificationId },
    );
  }
}

/**
 * Tells a matchmaker that a candidate accepted, left, or deleted their account
 * (prd §8.1). Sent straight away rather than through the `notifications` table:
 * that table exists to coalesce and throttle a stream of messages, and these
 * happen once. Nothing is thrown if the matchmaker has both channels off — the
 * action checks, so this stays cheap in the mutation that caused it.
 */
export async function notifyMatchmakerOfMembership(
  ctx: MutationCtx,
  args: { candidateId: Id<"candidates">; event: MembershipNotice },
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.notifications.actions.sendMembershipNotice,
    args,
  );
}

export type MembershipNotice = "accepted" | "left" | "account_deleted";
