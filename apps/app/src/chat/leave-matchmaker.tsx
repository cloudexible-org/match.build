import { api, CANDIDATE_LIMITS, type Id, leaveReasonError } from "@repo/api";
import { Button, Field, FieldError, FieldLabel, Textarea } from "@repo/ui";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { serverErrorMessage } from "../lib/server-error";

/**
 * Leaving a matchmaker (prd/phase-1.md §3.4), from the third column of the
 * candidate shell.
 *
 * The confirmation says plainly what leaving does and does not do: the
 * conversation goes from this account, and the matchmaker keeps their copy of
 * it. Nobody should discover that afterwards. The reason is optional — nobody has
 * to explain themselves to leave — and goes into the matchmaker's History.
 */
export function LeaveMatchmaker({
  candidateId,
  matchmakerName,
  onCancel,
}: {
  candidateId: Id<"candidates">;
  matchmakerName: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const leave = useMutation(api.candidates.mutations.leave);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = leaveReasonError(reason);
    setError(invalid);
    if (invalid) return;
    setLeaving(true);
    try {
      await leave({ candidateId, reason: reason.trim() || undefined });
      // The conversation is no longer theirs to open, so don't go back to it.
      // `/c` without a hash opens whichever matchmaker is left, or the empty
      // state when none is.
      void navigate("/c", { replace: true });
    } catch (caught) {
      setError(serverErrorMessage(caught, "That didn't work. Try again."));
      setLeaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex shrink-0 flex-col gap-3 rounded-lg border border-border bg-accent/40 p-3"
      data-testid="leave-confirmation"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Leave {matchmakerName}?</h2>
        <p className="text-sm text-muted-foreground">
          This conversation will go from your matchmakers and you won't be able
          to send or read messages here. {matchmakerName} keeps their copy of
          it. They can invite you back, and the thread carries on where it left
          off.
        </p>
      </div>
      <Field invalid={error !== null}>
        <FieldLabel>Reason (optional)</FieldLabel>
        <Textarea
          rows={2}
          maxLength={CANDIDATE_LIMITS.leaveReason}
          placeholder={`Anything you'd like ${matchmakerName} to know`}
          className="min-h-16 resize-y"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <FieldError match>{error}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={leaving}>
          {leaving ? "Leaving…" : `Leave ${matchmakerName}`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={leaving}
          onClick={onCancel}
        >
          Stay
        </Button>
      </div>
    </form>
  );
}
