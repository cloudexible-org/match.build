import { api } from "@repo/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import {
  type PushBlocker,
  type PushState,
  readPushState,
  subscribe,
  unsubscribe,
} from "./push";

/**
 * The notification controls on `/settings` (prd/phase-1.md §8.1): one switch
 * per channel, and whatever the truth about push is on this device.
 *
 * Email is simple — a preference on the account. Push is not: it belongs to
 * this browser, needs permission, and on iOS needs the app installed first, so
 * the card says which of those is in the way rather than offering a switch
 * that silently fails.
 */
export function NotificationSettings() {
  const settings = useQuery(api.notifications.queries.settings);

  if (settings === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }
  if (settings === null) return null; // RequireAuth handles this
  return <Channels settings={settings} />;
}

type Settings = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  email?: string;
  vapidPublicKey: string | null;
};

function Channels({ settings }: { settings: Settings }) {
  const setChannels = useMutation(api.notifications.mutations.setChannels);
  const subscribePush = useMutation(api.notifications.mutations.subscribePush);
  const unsubscribePush = useMutation(
    api.notifications.mutations.unsubscribePush,
  );

  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<"email" | "push" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { vapidPublicKey } = settings;
  const refreshPush = useCallback(async () => {
    setPush(await readPushState(vapidPublicKey));
  }, [vapidPublicKey]);

  useEffect(() => {
    void refreshPush();
  }, [refreshPush]);

  async function toggleEmail() {
    setBusy("email");
    setError(null);
    try {
      await setChannels({
        emailEnabled: !settings.emailEnabled,
        pushEnabled: settings.pushEnabled,
      });
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that. Try again."));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Turning push on subscribes *this* browser and stores it; turning it off
   * removes it here and on the server, and also clears the account-level
   * preference so no other device keeps pushing.
   */
  async function togglePush() {
    setBusy("push");
    setError(null);
    try {
      if (push?.subscribed) {
        const endpoint = await unsubscribe();
        if (endpoint !== null) await unsubscribePush({ endpoint });
        await setChannels({
          emailEnabled: settings.emailEnabled,
          pushEnabled: false,
        });
      } else {
        if (vapidPublicKey === null) return;
        const subscription = await subscribe(vapidPublicKey);
        if (subscription === null) {
          setError(
            "Your browser didn't allow notifications. You can change that in its settings.",
          );
          return;
        }
        await subscribePush(subscription);
        await setChannels({
          emailEnabled: settings.emailEnabled,
          pushEnabled: true,
        });
      }
      await refreshPush();
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const pushOn = settings.pushEnabled && push?.subscribed === true;

  return (
    <Card data-testid="notification-settings">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          We only tell you that there's something to read — never what it says.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Channel
          label="Email"
          description={
            settings.email === undefined
              ? "Sent about five minutes after a message you haven't opened."
              : `Sent to ${settings.email}, about five minutes after a message you haven't opened.`
          }
          on={settings.emailEnabled}
          busy={busy === "email"}
          testId="notify-email"
          onToggle={() => void toggleEmail()}
        />

        <Channel
          label="Push notifications"
          description="On this device, about thirty seconds after a message you haven't opened."
          on={pushOn}
          busy={busy === "push"}
          testId="notify-push"
          blocked={push === null ? "unsupported" : push.blocker}
          onToggle={() => void togglePush()}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** What to say instead of a switch, when push can't be offered here. */
const BLOCKED: Record<PushBlocker, ReactNode> = {
  unsupported: "This browser can't show push notifications.",
  no_keys: "Push notifications aren't set up on this deployment yet.",
  denied:
    "This browser is blocking notifications. Allow them in its settings, then come back.",
  not_installed: (
    <>
      On iPhone and iPad, push notifications need the app on your home screen:
      tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and
      open it from there. Email notifications work either way.
    </>
  ),
};

function Channel({
  label,
  description,
  on,
  busy,
  blocked,
  testId,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  busy: boolean;
  blocked?: PushBlocker | null;
  testId: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
        {blocked ? null : (
          <Button
            variant={on ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            disabled={busy}
            aria-pressed={on}
            data-testid={`${testId}-toggle`}
            onClick={onToggle}
          >
            {busy ? "Saving…" : on ? "On" : "Off"}
          </Button>
        )}
      </div>
      {blocked && (
        <p
          className="text-sm text-muted-foreground"
          data-testid={`${testId}-blocked`}
        >
          {BLOCKED[blocked]}
        </p>
      )}
    </div>
  );
}
