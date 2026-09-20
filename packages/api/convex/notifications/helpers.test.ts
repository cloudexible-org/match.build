import { describe, expect, test } from "vitest";
import { encryptPushPayload, fromBase64url, toBase64url } from "./helpers";

/**
 * RFC 8291 §5 publishes a complete worked example of a web-push message: the
 * plaintext, both keypairs, the auth secret, the salt, and the exact bytes the
 * body must come to. Replaying it is what proves our `aes128gcm` path is
 * right — an encryption bug is otherwise invisible, since a push service
 * accepts the request and the browser silently drops what it can't decrypt.
 */

const VECTOR = {
  plaintext: "When I grow up, I want to be a watermelon",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** The vector's sender keypair, from its published private scalar and point. */
async function senderKeyPair(): Promise<CryptoKeyPair> {
  const point = fromBase64url(VECTOR.asPublic);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: toBase64url(point.subarray(1, 33)),
    y: toBase64url(point.subarray(33, 65)),
    ext: true,
  } as const;
  const algorithm = { name: "ECDH", namedCurve: "P-256" } as const;
  return {
    privateKey: await crypto.subtle.importKey(
      "jwk",
      { ...jwk, d: VECTOR.asPrivate },
      algorithm,
      true,
      ["deriveBits"],
    ),
    publicKey: await crypto.subtle.importKey("jwk", jwk, algorithm, true, []),
  };
}

describe("web push encryption", () => {
  test("reproduces the RFC 8291 test vector exactly", async () => {
    const body = await encryptPushPayload(
      { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret },
      VECTOR.plaintext,
      { salt: fromBase64url(VECTOR.salt), keyPair: await senderKeyPair() },
    );
    expect(toBase64url(body)).toBe(VECTOR.body);
  });

  test("a real send uses a fresh key and salt every time", async () => {
    const subscription = {
      p256dh: VECTOR.uaPublic,
      auth: VECTOR.authSecret,
    };
    const first = await encryptPushPayload(subscription, VECTOR.plaintext);
    const second = await encryptPushPayload(subscription, VECTOR.plaintext);
    expect(toBase64url(first)).not.toBe(toBase64url(second));
    // Same shape as the vector: salt(16) + rs(4) + idlen(1) + key(65) + body.
    expect(first.length).toBe(fromBase64url(VECTOR.body).length);
    expect(first[20]).toBe(65);
  });
});

describe("base64url", () => {
  test("round-trips bytes without padding", () => {
    const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i * 7) % 256);
    expect(toBase64url(bytes)).not.toContain("=");
    expect([...fromBase64url(toBase64url(bytes))]).toEqual([...bytes]);
  });
});
