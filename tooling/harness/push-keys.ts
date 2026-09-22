import { generateKeyPairSync, randomBytes } from "node:crypto";
import { setBackendEnv } from "./admin-client";

/**
 * VAPID keys for the local backend, so a spec can prove the push path really
 * runs (prd/phase-1.md §8.2). Not set by global setup: a deployment *without*
 * keys must also behave — that is the default, and the settings page says
 * "push isn't set up" — so the spec that wants push sets them itself.
 *
 * Generated in the same format `packages/api/scripts/setup-push.mjs` writes:
 * the public key as the uncompressed P-256 point, the private key as the bare
 * scalar, both base64url.
 */
export function generateVapidKeys(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  if (pub.x === undefined || pub.y === undefined || priv.d === undefined) {
    throw new Error("Node did not export a P-256 JWK as expected.");
  }
  return {
    publicKey: Buffer.concat([
      Buffer.of(4),
      Buffer.from(pub.x, "base64url"),
      Buffer.from(pub.y, "base64url"),
    ]).toString("base64url"),
    privateKey: priv.d,
  };
}

/** Puts a fresh set of keys on the local backend and returns the public one. */
export async function configurePushKeys(): Promise<string> {
  const keys = generateVapidKeys();
  await setBackendEnv({
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: "mailto:e2e@matchmaker-e2e.test",
  });
  return keys.publicKey;
}

/** Removes them again, leaving the backend as the suite found it. */
export async function clearPushKeys(): Promise<void> {
  await setBackendEnv({
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    VAPID_SUBJECT: "",
  });
}

/**
 * A browser subscription, as `pushSubscriptions` stores one. The keys are the
 * receiver's half of RFC 8291's own test vector, so they are a real P-256 point
 * and a real 16-byte auth secret — which is what the encryption needs to
 * succeed. Nothing decrypts the result; the point is that the deployment can
 * produce it and post it.
 */
export const FAKE_SUBSCRIPTION = {
  p256dh:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
} as const;

/**
 * A stand-in push service on the local backend's own HTTP origin. The route is
 * the deployment's health check, which is registered for GET alone, so the
 * push's POST gets a 404 — a push service's "this browser is gone", which is
 * the case worth proving (prd §8.2). Pointing at ourselves proves the request
 * was built, signed and sent without needing the internet.
 *
 * Unique per call, like everything else a spec seeds (`scenario.ts`).
 * `pushSubscriptions` is keyed by endpoint and read back through
 * `by_endpoint` with `.unique()`, so two rows sharing one URL — a retried
 * `beforeAll` reseeding, or a second spec that also wants a dead browser —
 * would make every lookup for it throw, and the subscription would never be
 * dropped. The query string is ignored by the route.
 */
export function fakePushEndpoint(): string {
  const port = process.env.E2E_CONVEX_SITE_PORT;
  if (!port) {
    throw new Error(
      "E2E_CONVEX_SITE_PORT is unset — run the suite via Playwright.",
    );
  }
  const ns = randomBytes(6).toString("hex");
  return `http://127.0.0.1:${port}/api/health?e2e=${ns}`;
}
