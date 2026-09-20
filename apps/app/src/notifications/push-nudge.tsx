import { api } from "@repo/api";
import { Button } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { readPushState, subscribe } from "./push";

/**
 * Offers push notifications once the person has just sent a message
 * (prd/phase-1.md §8.2: "after a meaningful moment, not on first load").
 *
 * Asking at the wrong time is expensive: a browser prompt that gets dismissed
 * can't be shown again by the page, so the chance is spent. Just after writing
 * to someone is the moment it makes sense — they are waiting for a reply.
 *
 * Shown at most once per browser. "Not now" is remembered, and so is "yes",
 * because a granted permission makes `readPushState` report it as subscribed.
 */

const DISMISSED_KEY = "matchmaker-push-nudge-dismissed";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Blocked storage: the nudge may come back next visit. Better than
    // never offering it at all.
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nothing to do; see above.
  }
}

export function PushNudge() {
  const settings = useQuery(api.notifications.queries.settings);
  const subscribePush = useMutation(api.notifications.mutations.subscribePush);
  const setChannels = useMutation(api.notifications.mutations.setChannels);

  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const vapidPublicKey = settings?.vapidPublicKey ?? null;

  useEffect(() => {
    if (settings === undefined || settings === null) return;
    if (dismissed()) return;
    let cancelled = false;
    void readPushState(vapidPublicKey).then((state) => {
      // Only when it can actually be turned on here and isn't already: a
      // blocker of any kind belongs on the settings page, not in a chat.
      if (!cancelled) setShow(state.blocker === null && !state.subscribed);
    });
    return () => {
      cancelled = true;
    };
  }, [settings, vapidPublicKey]);

  if (!show) return null;

  function close() {
    remember();
    setShow(false);
  }

  async function turnOn() {
    if (vapidPublicKey === null) return;
    setBusy(true);
    try {
      const subscription = await subscribe(vapidPublicKey);
      if (subscription !== null) {
        await subscribePush(subscription);
        await setChannels({
          emailEnabled: settings?.emailEnabled ?? true,
          pushEnabled: true,
        });
      }
    } catch {
      // The settings page is where this gets diagnosed; a chat is not the
      // place for an error about notifications.
    } finally {
      close();
      setBusy(false);
    }
  }

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-accent/40 px-4 py-2.5"
      data-testid="push-nudge"
    >
      <p className="text-sm">
        Want a notification when there's a reply?{" "}
        <Link to="/settings" className="underline underline-offset-4">
          Manage in settings
        </Link>
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
          {busy ? "Turning on…" : "Turn on"}
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Not now
        </Button>
      </div>
    </div>
  );
}
