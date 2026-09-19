import {
  api,
  CANDIDATE_LIMITS,
  candidateNameError,
  handleError,
  type Id,
  NOTE_LIMITS,
  noteBodyError,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@repo/api";
import {
  Accordion,
  AccordionSection,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useId, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { CandidateHistory } from "./candidate-history";
import { type Membership, membershipMarker } from "./candidate-labels";
import { useWorkspace } from "./workspace-layout";

export type PanelCandidate = {
  candidateId: Id<"candidates">;
  name?: string;
  email: string;
  socialHandles: { platform: SocialPlatform; handle: string }[];
  membership: Membership;
  membershipChangedAt: number;
  status: "active" | "paused" | "archived";
  acceptedAs?: string;
  invite: { expiresAt: number; copyable: boolean } | null;
};

const STATUSES = ["active", "paused", "archived"] as const;

/**
 * The candidate panel (prd/phase-1.md §4.1): Details, Notes and History,
 * everything the matchmaker knows about one person that isn't the thread.
 * Private to them — a candidate has no route to any of it.
 */
export function CandidatePanel({
  candidate,
  onClose,
}: {
  candidate: PanelCandidate;
  /** Closes the panel where it covers the thread (below `lg`). */
  onClose: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-testid="candidate-panel"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 lg:hidden">
        <span className="truncate font-medium">
          About {candidate.name ?? candidate.email}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          data-testid="close-candidate-panel"
        >
          Close
        </Button>
      </div>
      {/* Sections rather than tabs: a matchmaker reading a thread wants the
          details and their notes at once, not one at a time. */}
      <Accordion defaultValue={["details"]} className="overflow-y-auto">
        <AccordionSection value="details" title="Details">
          <Details candidate={candidate} />
        </AccordionSection>
        <AccordionSection value="notes" title="Notes">
          <Notes candidateId={candidate.candidateId} />
        </AccordionSection>
        <AccordionSection value="history" title="History">
          <CandidateHistory candidateId={candidate.candidateId} />
        </AccordionSection>
      </Accordion>
    </div>
  );
}

type HandleRow = { key: string; platform: SocialPlatform; handle: string };

function Details({ candidate }: { candidate: PanelCandidate }) {
  const workspace = useWorkspace();
  const idPrefix = useId();
  const update = useMutation(api.candidates.mutations.updateDetails);
  const setStatus = useMutation(api.candidates.mutations.setStatus);
  const [name, setName] = useState(candidate.name ?? "");
  const [handles, setHandles] = useState<HandleRow[]>(() =>
    candidate.socialHandles.map((handle, index) => ({
      key: `${idPrefix}-${index}`,
      ...handle,
    })),
  );
  const [nextKey, setNextKey] = useState(candidate.socialHandles.length);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatusLabel] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid =
      candidateNameError(name) ??
      handles
        .map((row) => handleError(row.platform, row.handle))
        .find((message) => message !== null) ??
      null;
    setError(invalid);
    if (invalid) return;
    setStatusLabel("saving");
    try {
      await update({
        matchmakerId: workspace.matchmakerId,
        candidateId: candidate.candidateId,
        name,
        socialHandles: handles.map(({ platform, handle }) => ({
          platform,
          handle,
        })),
      });
      setStatusLabel("saved");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
      setStatusLabel("idle");
    }
  }

  const marker = membershipMarker(candidate.membership);
  return (
    <div className="flex flex-col gap-5">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        data-testid="candidate-details-form"
      >
        <Field invalid={error !== null}>
          <FieldLabel>Name</FieldLabel>
          <Input
            maxLength={CANDIDATE_LIMITS.name + 10}
            value={name}
            placeholder={candidate.email}
            onChange={(event) => {
              setName(event.target.value);
              setStatusLabel("idle");
            }}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Social handles</legend>
          {handles.map((row, index) => (
            <div
              key={row.key}
              className="flex gap-2"
              data-testid="details-handle"
            >
              <Field className="w-28 shrink-0">
                <FieldLabel className="sr-only">
                  Platform {index + 1}
                </FieldLabel>
                <NativeSelect
                  value={row.platform}
                  onChange={(event) =>
                    setHandles((rows) =>
                      rows.map((other) =>
                        other.key === row.key
                          ? {
                              ...other,
                              platform: event.target.value as SocialPlatform,
                            }
                          : other,
                      ),
                    )
                  }
                >
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {SOCIAL_PLATFORM_LABELS[platform]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="flex-1">
                <FieldLabel className="sr-only">Handle {index + 1}</FieldLabel>
                <Input
                  value={row.handle}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) =>
                    setHandles((rows) =>
                      rows.map((other) =>
                        other.key === row.key
                          ? { ...other, handle: event.target.value }
                          : other,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove handle ${index + 1}`}
                onClick={() =>
                  setHandles((rows) =>
                    rows.filter((other) => other.key !== row.key),
                  )
                }
              >
                ✕
              </Button>
            </div>
          ))}
          {handles.length < CANDIDATE_LIMITS.socialHandles && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setHandles((rows) => [
                  ...rows,
                  {
                    key: `${idPrefix}-${nextKey}`,
                    platform: "instagram",
                    handle: "",
                  },
                ]);
                setNextKey((key) => key + 1);
              }}
            >
              Add a handle
            </Button>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save details"}
          </Button>
          <span
            aria-live="polite"
            className="text-sm text-muted-foreground"
            data-testid="candidate-details-status"
          >
            {status === "saved" ? "Saved." : ""}
          </span>
        </div>
      </form>

      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate" data-testid="candidate-email">
            {candidate.email}
          </dd>
        </div>
        {candidate.acceptedAs !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Accepted as</dt>
            <dd className="truncate">{candidate.acceptedAs}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Membership</dt>
          <dd data-testid="candidate-membership">{marker ?? "Joined"}</dd>
        </div>
      </dl>

      <Field className="border-t border-border pt-4">
        <FieldLabel>Status</FieldLabel>
        <NativeSelect
          value={candidate.status}
          data-testid="candidate-status"
          onChange={(event) =>
            void setStatus({
              matchmakerId: workspace.matchmakerId,
              candidateId: candidate.candidateId,
              status: event.target.value as (typeof STATUSES)[number],
            })
          }
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}

function Notes({ candidateId }: { candidateId: Id<"candidates"> }) {
  const workspace = useWorkspace();
  const notes = useQuery(api.notes.queries.list, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });
  const create = useMutation(api.notes.mutations.create);
  const edit = useMutation(api.notes.mutations.edit);
  const remove = useMutation(api.notes.mutations.remove);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Id<"notes"> | null>(null);
  const [editBody, setEditBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    const invalid = noteBodyError(draft);
    setError(invalid);
    if (invalid) return;
    try {
      await create({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        body: draft,
      });
      setDraft("");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that note."));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="candidate-notes">
      <form noValidate onSubmit={add} className="flex flex-col gap-2">
        <Field invalid={error !== null}>
          <FieldLabel className="sr-only">New note</FieldLabel>
          <Textarea
            aria-label="New note"
            placeholder="Only you can see your notes."
            rows={3}
            maxLength={NOTE_LIMITS.body}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {error && <FieldError match>{error}</FieldError>}
        </Field>
        <Button type="submit" size="sm" className="self-start">
          Add note
        </Button>
      </form>

      {notes === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note._id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              data-testid="candidate-note"
            >
              {editing === note._id ? (
                <>
                  <Textarea
                    aria-label="Edit note"
                    rows={3}
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void edit({
                          matchmakerId: workspace.matchmakerId,
                          noteId: note._id,
                          body: editBody,
                        }).then(() => setEditing(null))
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {note.body}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(note._id);
                        setEditBody(note.body);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void remove({
                          matchmakerId: workspace.matchmakerId,
                          noteId: note._id,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
