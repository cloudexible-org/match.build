/**
 * Web push from the browser's side (prd/phase-1.md §8.2).
 *
 * Three things make this fiddly, and all three are handled here rather than in
 * the component:
 *
 *   1. **iOS only delivers web push to an installed app** (16.4+). Asking a
 *      Safari user for permission before they have added the app to their home
 *      screen fails, and the prompt cannot be asked for again. So iOS is told
 *      to install first, and email carries them until they do.
 *   2. The subscription belongs to *this browser*, not the account, so it has
 *      to be re-registered per device and removed when it is turned off here.
 *   3. Permission, once denied, cannot be asked for again by the page — the
 *      person has to change it in browser settings, so the UI has to say that
 *      instead of offering a button that does nothing.
 */

/** Why push can't be switched on here, or `null` when it can. */
export type PushBlocker =
  | "unsupported"
  | "not_installed"
  | "denied"
  | "no_keys";

export type PushState = {
  /** `null` when push can be offered; otherwise why it can't. */
  blocker: PushBlocker | null;
  /** Whether this browser already has a subscription. */
  subscribed: boolean;
};

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Whether the page is running as an installed app rather than a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, non-standard flag; it is the only one iOS sets.
    ("standalone" in navigator && navigator.standalone === true)
  );
}

/**
 * iOS and iPadOS, where push needs an installed app. Detected from the UA
 * because there is no feature test for the restriction — `PushManager` exists
 * in Safari either way, and subscribing is what fails.
 */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, but with touch points.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** What the settings page should offer, given this browser and deployment. */
export async function readPushState(
  vapidPublicKey: string | null,
): Promise<PushState> {
  if (!pushSupported()) return { blocker: "unsupported", subscribed: false };
  if (vapidPublicKey === null) return { blocker: "no_keys", subscribed: false };

  const subscription = await currentSubscription();
  const subscribed = subscription !== null;
  // An existing subscription means it already works here, whatever the
  // install state says — never tell someone to install an app they installed.
  if (subscribed) return { blocker: null, subscribed };
  if (Notification.permission === "denied") {
    return { blocker: "denied", subscribed };
  }
  if (isIos() && !isInstalled()) {
    return { blocker: "not_installed", subscribed };
  }
  return { blocker: null, subscribed };
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return await registration.pushManager.getSubscription();
}

/** The fields the server stores, from a browser subscription. */
export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export function describeSubscription(
  subscription: PushSubscription,
): StoredSubscription | null {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (p256dh === null || auth === null) return null;
  return {
    endpoint: subscription.endpoint,
    p256dh: toBase64url(p256dh),
    auth: toBase64url(auth),
    userAgent: navigator.userAgent.slice(0, 200),
  };
}

/**
 * Asks for permission and subscribes this browser, returning what the server
 * should store. `null` means the person said no (or dismissed the prompt),
 * which is not an error.
 */
export async function subscribe(
  vapidPublicKey: string,
): Promise<StoredSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    // Required by every browser: a push that shows nothing is not allowed.
    userVisibleOnly: true,
    applicationServerKey: fromBase64url(vapidPublicKey),
  });
  return describeSubscription(subscription);
}

/** Drops this browser's subscription. Returns the endpoint it had, if any. */
export async function unsubscribe(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (subscription === null) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

function toBase64url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) =>
    char.charCodeAt(0),
  ) as Uint8Array<ArrayBuffer>;
}
