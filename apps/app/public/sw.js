/**
 * Service worker for apps/app (prd/phase-1.md §8.2).
 *
 * Two jobs, and deliberately no third:
 *
 *   1. Show a push notification. The payload is what
 *      `convex/notifications/rules.ts` builds — a title, a one-line body and a
 *      URL — and never the message itself, because this is read on a lock
 *      screen (§9.3).
 *   2. Focus the app on the right conversation when one is tapped.
 *
 * It does **not** cache anything. An offline cache of a real-time chat shows
 * stale conversations, and a stale build of an app whose backend has moved on;
 * the app needs the network to be useful at all. Being installable does not
 * require caching — only the manifest and a registered worker.
 *
 * Every path is relative to this file, which is served from the app's base
 * path (`/app/`), so nothing here hard-codes where the app is mounted.
 */

const ICON = "./icon-192x192.png";

// Replace any previous version of this worker at once, including the caching
// one that shipped before: `caches` it left behind are cleared on activation.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return; // Not ours, or corrupt: better silent than a broken notification.
  }
  const url = new URL(payload.url ?? "./", self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Matchmaker", {
      body: payload.body ?? "",
      icon: ICON,
      badge: ICON,
      // One notification per conversation replaces the last, rather than
      // stacking five of them for one chat.
      tag: url,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse a tab that already has the app open: navigate it to the
      // conversation rather than opening a second copy of the app.
      for (const client of clients) {
        if (!client.url.startsWith(self.registration.scope)) continue;
        await client.focus();
        if (client.url !== url && "navigate" in client) {
          await client.navigate(url);
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
