import type { Id } from "@repo/api";
import { Button } from "@repo/ui";
import { useState } from "react";
import { Link } from "react-router";
import { LeaveMatchmaker } from "../chat/leave-matchmaker";
import { PanelHeader } from "../shell/panel-header";

export type SelectedMatchmaker = {
  candidateId: Id<"candidates">;
  matchmakerUsername: string;
  matchmakerDisplayName: string;
  joinedAt: number;
};

/**
 * The candidate shell's third column (prd/phase-1.md §4.2): who this
 * matchmaker is, what this account's standing with them is, and the two
 * things the candidate can do about it — notifications and leaving.
 *
 * The mirror of the matchmaker's candidate panel, and deliberately much
 * thinner: a candidate keeps no record of their matchmaker.
 */
export function MatchmakerPanel({
  matchmaker,
  onClose,
}: {
  matchmaker: SelectedMatchmaker;
  /** Closes the panel where it covers the thread (below `lg`). */
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const name = matchmaker.matchmakerDisplayName;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-testid="matchmaker-panel"
    >
      <PanelHeader
        title={`About ${name}`}
        onClose={onClose}
        closeTestId="close-matchmaker-panel"
      />

      {/* Scrolls under the header, so the way back to the conversation on a
          phone stays where it was put. */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        data-testid="matchmaker-panel-scroll"
      >
        <div className="flex flex-col gap-0.5">
          <h2
            className="font-display text-xl"
            data-testid="matchmaker-panel-name"
          >
            {name}
          </h2>
          <p className="text-sm text-muted-foreground">
            @{matchmaker.matchmakerUsername}
          </p>
        </div>

        <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Membership</dt>
            <dd data-testid="matchmaker-panel-membership">
              Joined {new Date(matchmaker.joinedAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {/* Notifications are an account-wide preference (prd §8.1), not one
              per matchmaker, so this points at the account's own settings
              rather than repeating the controls here. */}
          <Link
            to="/settings"
            className="text-sm underline-offset-4 hover:underline"
            data-testid="matchmaker-panel-notifications"
          >
            Notification settings
          </Link>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {leaving ? (
            <LeaveMatchmaker
              candidateId={matchmaker.candidateId}
              matchmakerName={name}
              onCancel={() => setLeaving(false)}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              data-testid="matchmaker-panel-leave"
              onClick={() => setLeaving(true)}
            >
              Leave {name}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
