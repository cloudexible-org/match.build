import { api, type Id } from "@repo/api";
import { Button, Field, FieldLabel, NativeSelect } from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { useWorkspace } from "../workspace/workspace-layout";
import { personName } from "./cards";

/**
 * Pairing two people yourself (prd/phase-3.md §2).
 *
 * It produces an identical card, scored by the same algorithm — including a
 * pair the hard filters would have refused, which is the point of having this
 * at all: a matchmaker who has met both of them knows something the profiles
 * don't. The card still says what the algorithm thought.
 */
export function NewMatch({ onDone }: { onDone: () => void }) {
  const workspace = useWorkspace();
  const people = useQuery(api.matches.queries.matchable, {
    matchmakerId: workspace.matchmakerId,
  });
  const create = useMutation(api.matches.mutations.create);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (a === "" || b === "") {
      setError("Pick two people.");
      return;
    }
    if (a === b) {
      setError("A match needs two different people.");
      return;
    }
    setSaving(true);
    try {
      await create({
        matchmakerId: workspace.matchmakerId,
        candidateAId: a as Id<"candidates">,
        candidateBId: b as Id<"candidates">,
      });
      setA("");
      setB("");
      setError(null);
      onDone();
    } catch (thrown) {
      setError(serverErrorMessage(thrown, "That didn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (people !== undefined && people.length < 2) {
    return (
      <p
        className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
        data-testid="new-match-empty"
      >
        Matching needs two people who have joined your book.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="new-match"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="min-w-0 flex-1">
          <FieldLabel>First</FieldLabel>
          <NativeSelect
            value={a}
            onChange={(event) => setA(event.target.value)}
            data-testid="new-match-a"
          >
            <option value="">Choose someone</option>
            {(people ?? []).map((person) => (
              <option key={person.candidateId} value={person.candidateId}>
                {personName(person)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field className="min-w-0 flex-1">
          <FieldLabel>Second</FieldLabel>
          <NativeSelect
            value={b}
            onChange={(event) => setB(event.target.value)}
            data-testid="new-match-b"
          >
            <option value="">Choose someone</option>
            {(people ?? [])
              .filter((person) => person.candidateId !== a)
              .map((person) => (
                <option key={person.candidateId} value={person.candidateId}>
                  {personName(person)}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <div className="flex shrink-0 gap-2">
          <Button type="submit" disabled={saving} data-testid="new-match-save">
            {saving ? "Pairing…" : "Pair them"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
      {error !== null && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="new-match-error"
        >
          {error}
        </p>
      )}
    </form>
  );
}
