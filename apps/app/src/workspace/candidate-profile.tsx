import {
  ageFromDateOfBirth,
  api,
  CANDIDATE_GROUP_LABELS,
  CANDIDATE_GROUP_ORDER,
  CANDIDATE_PROFILE_FIELDS,
  CANDIDATE_PROFILE_NOTES,
  type CandidateFieldDef,
  candidateField,
  candidateNoteLabel,
  displayValue,
  type Id,
  noteBodyError,
  noteKeyError,
  PROFILE_LIMITS,
  PROFILE_SOURCE_LABELS,
  type ProfileValueSource,
  valueError,
} from "@repo/api";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
} from "@repo/ui";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { useWorkspace } from "./workspace-layout";

/**
 * The Profile section of the candidate panel (prd/phase-2.md §3, §5): what the
 * matchmaker knows about one person, as structured facts and free-text notes.
 *
 * **It renders what is filled in, not the whole registry.** Forty-odd empty
 * rows would bury the four that say something; a field arrives when somebody
 * adds it. The registry is still the only description of a field — this
 * screen imports the same one the server validates against, so a value the
 * form accepts is a value the mutation accepts.
 *
 * Suggestions sit at the top, visually apart from the record, because a
 * proposal nobody has answered is not yet part of it.
 */

type Entry = {
  value: string;
  source: ProfileValueSource;
  updatedAt: number;
  model?: string;
  sourceQuote?: string;
  confidence?: number;
  pending?: {
    action: "set" | "clear";
    value: string;
    suggestedAt: number;
    model: string;
    confidence?: number;
    sourceQuote?: string;
  };
};

type Entries = Record<string, Entry>;
type EntryKind = "facts" | "notes";

export function CandidateProfile({
  candidateId,
}: {
  candidateId: Id<"candidates">;
}) {
  const workspace = useWorkspace();
  const profile = useQuery(api.candidateProfiles.queries.get, {
    matchmakerId: workspace.matchmakerId,
    candidateId,
  });

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="candidate-profile">
      <Suggestions
        candidateId={candidateId}
        facts={profile.facts}
        notes={profile.notes}
      />
      <Facts candidateId={candidateId} entries={profile.facts} />
      <Notes candidateId={candidateId} entries={profile.notes} />
    </div>
  );
}

/*
 * ─── Suggestions ────────────────────────────────────────────────────────────
 */

function Suggestions({
  candidateId,
  facts,
  notes,
}: {
  candidateId: Id<"candidates">;
  facts: Entries;
  notes: Entries;
}) {
  const workspace = useWorkspace();
  const resolve = useMutation(
    api.candidateProfiles.mutations.resolveSuggestion,
  );

  const pending = [
    ...pendingIn("facts", facts),
    ...pendingIn("notes", notes),
  ].sort((a, b) => a.proposal.suggestedAt - b.proposal.suggestedAt);
  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">
        Suggested {pending.length === 1 ? "change" : "changes"}
      </h4>
      <ul className="flex flex-col gap-2">
        {pending.map(({ kind, key, entry, proposal }) => {
          return (
            <li
              key={`${kind}.${key}`}
              // Deliberately unlike a saved value: nothing here is on the
              // record until somebody says so.
              className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3"
              data-testid="profile-suggestion"
              data-kind={kind}
              data-field={key}
            >
              <span className="text-xs text-muted-foreground">
                {labelFor(kind, key)}
              </span>
              {proposal.action === "clear" ? (
                <p className="break-words text-sm">
                  Remove this —{" "}
                  <s className="text-muted-foreground">
                    {renderValue(kind, key, entry.value)}
                  </s>
                </p>
              ) : entry.value ? (
                <p className="break-words text-sm">
                  <s className="text-muted-foreground">
                    {renderValue(kind, key, entry.value)}
                  </s>{" "}
                  → {renderValue(kind, key, proposal.value)}
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {renderValue(kind, key, proposal.value)}
                </p>
              )}
              {proposal.sourceQuote && (
                <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                  “{proposal.sourceQuote}”
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  data-testid="profile-suggestion-accept"
                  onClick={() =>
                    void resolve({
                      matchmakerId: workspace.matchmakerId,
                      candidateId,
                      kind,
                      key,
                      accept: true,
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="profile-suggestion-dismiss"
                  onClick={() =>
                    void resolve({
                      matchmakerId: workspace.matchmakerId,
                      candidateId,
                      kind,
                      key,
                      accept: false,
                    })
                  }
                >
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The entries carrying a proposal, with the proposal already narrowed out. */
function pendingIn(kind: EntryKind, entries: Entries) {
  return Object.entries(entries).flatMap(([key, entry]) =>
    entry.pending === undefined
      ? []
      : [{ kind, key, entry, proposal: entry.pending }],
  );
}

/*
 * ─── Facts ──────────────────────────────────────────────────────────────────
 */

function Facts({
  candidateId,
  entries,
}: {
  candidateId: Id<"candidates">;
  entries: Entries;
}) {
  const filled = Object.keys(entries).filter((key) => entries[key]?.value);
  const groups = CANDIDATE_GROUP_ORDER.map((group) => ({
    group,
    fields: CANDIDATE_PROFILE_FIELDS.filter(
      (field) => field.group === group && filled.includes(field.key),
    ),
  })).filter(({ fields }) => fields.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        groups.map(({ group, fields }) => (
          <div key={group} className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">
              {CANDIDATE_GROUP_LABELS[group]}
            </h4>
            <ul className="flex flex-col divide-y divide-border">
              {fields.map((field) => (
                <FactRow
                  key={field.key}
                  candidateId={candidateId}
                  field={field}
                  // biome-ignore lint/style/noNonNullAssertion: `filled` proves it
                  entry={entries[field.key]!}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      <AddFact candidateId={candidateId} filled={filled} />
    </div>
  );
}

function FactRow({
  candidateId,
  field,
  entry,
}: {
  candidateId: Id<"candidates">;
  field: CandidateFieldDef;
  entry: Entry;
}) {
  const workspace = useWorkspace();
  const save = useMutation(api.candidateProfiles.mutations.setEntry);
  const clear = useMutation(api.candidateProfiles.mutations.clearEntryValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.value);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = valueError(field, draft);
    setError(invalid);
    if (invalid) return;
    try {
      await save({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        kind: "facts",
        key: field.key,
        value: draft,
      });
      setEditing(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that."));
    }
  }

  return (
    <li
      className="flex flex-col gap-1 py-2"
      data-testid="profile-field"
      data-field={field.key}
    >
      {editing ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-2">
          <Field invalid={error !== null}>
            <FieldLabel>{field.label}</FieldLabel>
            <ValueInput field={field} value={draft} onChange={setDraft} />
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              field.hint && <FieldDescription>{field.hint}</FieldDescription>
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(entry.value);
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">{field.label}</span>
            <span className="break-words text-right text-sm">
              {displayValue(field, entry.value)}
              {field.key === "dateOfBirth" && ageOf(entry.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {PROFILE_SOURCE_LABELS[entry.source]}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(entry.value);
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void clear({
                  matchmakerId: workspace.matchmakerId,
                  candidateId,
                  kind: "facts",
                  key: field.key,
                })
              }
            >
              Clear
            </Button>
          </div>
          {entry.sourceQuote && (
            <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
              “{entry.sourceQuote}”
            </p>
          )}
        </>
      )}
    </li>
  );
}

function AddFact({
  candidateId,
  filled,
}: {
  candidateId: Id<"candidates">;
  filled: string[];
}) {
  const workspace = useWorkspace();
  const save = useMutation(api.candidateProfiles.mutations.setEntry);
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const available = CANDIDATE_PROFILE_FIELDS.filter(
    (field) => !filled.includes(field.key),
  );
  const field = key ? candidateField(key) : null;
  if (available.length === 0) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (field === null) {
      setError("Pick a field first.");
      return;
    }
    const invalid = valueError(field, draft);
    setError(invalid);
    if (invalid) return;
    try {
      await save({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        kind: "facts",
        key: field.key,
        value: draft,
      });
      setKey("");
      setDraft("");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that."));
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-2"
      data-testid="profile-add-field-form"
    >
      <Field invalid={error !== null}>
        <FieldLabel>Add a field</FieldLabel>
        <NativeSelect
          data-testid="profile-add-field"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setDraft("");
            setError(null);
          }}
        >
          <option value="">Choose a field…</option>
          {CANDIDATE_GROUP_ORDER.map((group) => {
            const options = available.filter((one) => one.group === group);
            if (options.length === 0) return null;
            return (
              <optgroup key={group} label={CANDIDATE_GROUP_LABELS[group]}>
                {options.map((one) => (
                  <option key={one.key} value={one.key}>
                    {one.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </NativeSelect>
        {field && (
          <ValueInput field={field} value={draft} onChange={setDraft} />
        )}
        {error ? (
          <FieldError match>{error}</FieldError>
        ) : (
          field?.hint && <FieldDescription>{field.hint}</FieldDescription>
        )}
      </Field>
      {field && (
        <Button type="submit" size="sm" className="self-start">
          Add
        </Button>
      )}
    </form>
  );
}

/**
 * The control a field's value kind asks for. The registry is the only place
 * that says what a field is, so it is also the only place this branches on.
 */
function ValueInput({
  field,
  value,
  onChange,
}: {
  field: CandidateFieldDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const spec = field.value;

  if (spec.kind === "choice") {
    return (
      <NativeSelect
        data-testid="profile-value"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose…</option>
        {spec.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
    );
  }
  if (spec.kind === "text" && spec.maxLength > 200) {
    return (
      <Textarea
        data-testid="profile-value"
        rows={3}
        maxLength={spec.maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      data-testid="profile-value"
      type={spec.kind === "date" ? "date" : "text"}
      inputMode={spec.kind === "integer" ? "numeric" : undefined}
      placeholder={placeholderFor(field)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function placeholderFor(field: CandidateFieldDef): string | undefined {
  const spec = field.value;
  if (spec.kind === "range") return `${spec.min}-${spec.max}`;
  if (spec.kind === "choices") return spec.options.join(", ");
  if (spec.kind === "list") return "Comma separated";
  return undefined;
}

/** Age is never stored beside a birth date; it's read off it. */
function ageOf(value: string): string {
  const age = ageFromDateOfBirth(value);
  return age === null ? "" : ` (${age})`;
}

/*
 * ─── Free-text notes ────────────────────────────────────────────────────────
 */

function Notes({
  candidateId,
  entries,
}: {
  candidateId: Id<"candidates">;
  entries: Entries;
}) {
  const filled = Object.keys(entries)
    .filter((key) => entries[key]?.value)
    .sort((a, b) => candidateNoteLabel(a).localeCompare(candidateNoteLabel(b)));

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">Notes</h4>
      {filled.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filled.map((key) => (
            <NoteRow
              key={key}
              candidateId={candidateId}
              noteKey={key}
              // biome-ignore lint/style/noNonNullAssertion: `filled` proves it
              entry={entries[key]!}
            />
          ))}
        </ul>
      )}
      <AddNote candidateId={candidateId} filled={filled} />
    </div>
  );
}

function NoteRow({
  candidateId,
  noteKey,
  entry,
}: {
  candidateId: Id<"candidates">;
  noteKey: string;
  entry: Entry;
}) {
  const workspace = useWorkspace();
  const save = useMutation(api.candidateProfiles.mutations.setEntry);
  const clear = useMutation(api.candidateProfiles.mutations.clearEntryValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.value);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = noteBodyError(draft);
    setError(invalid);
    if (invalid) return;
    try {
      await save({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        kind: "notes",
        key: noteKey,
        value: draft,
      });
      setEditing(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that note."));
    }
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
      data-testid="profile-note"
      data-note={noteKey}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {candidateNoteLabel(noteKey)}
      </span>
      {editing ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-2">
          <Field invalid={error !== null}>
            <FieldLabel className="sr-only">
              {candidateNoteLabel(noteKey)}
            </FieldLabel>
            <Textarea
              data-testid="profile-note-body"
              rows={4}
              maxLength={PROFILE_LIMITS.noteBody}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error && <FieldError match>{error}</FieldError>}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(entry.value);
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">
            {entry.value}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {PROFILE_SOURCE_LABELS[entry.source]}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(entry.value);
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void clear({
                  matchmakerId: workspace.matchmakerId,
                  candidateId,
                  kind: "notes",
                  key: noteKey,
                })
              }
            >
              Remove
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

const CUSTOM_NOTE = "__custom";

function AddNote({
  candidateId,
  filled,
}: {
  candidateId: Id<"candidates">;
  filled: string[];
}) {
  const workspace = useWorkspace();
  const save = useMutation(api.candidateProfiles.mutations.setEntry);
  const [choice, setChoice] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggested = CANDIDATE_PROFILE_NOTES.filter(
    (note) => !filled.includes(note.key),
  );
  const key = choice === CUSTOM_NOTE ? customKey : choice;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = noteKeyError(key) ?? noteBodyError(body);
    setError(invalid);
    if (invalid) return;
    try {
      await save({
        matchmakerId: workspace.matchmakerId,
        candidateId,
        kind: "notes",
        key,
        value: body,
      });
      setChoice("");
      setCustomKey("");
      setBody("");
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that note."));
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <Field invalid={error !== null}>
        <FieldLabel>Add a note</FieldLabel>
        <NativeSelect
          data-testid="profile-add-note-key"
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value);
            setError(null);
          }}
        >
          <option value="">Choose a note…</option>
          {suggested.map((note) => (
            <option key={note.key} value={note.key}>
              {note.label}
            </option>
          ))}
          <option value={CUSTOM_NOTE}>Something else…</option>
        </NativeSelect>
        {choice === CUSTOM_NOTE && (
          <Input
            aria-label="Note name"
            placeholder="idealWeekend"
            maxLength={PROFILE_LIMITS.noteKey}
            value={customKey}
            onChange={(event) => setCustomKey(event.target.value)}
          />
        )}
        {choice && (
          <Textarea
            aria-label="New note"
            placeholder="Only you can see this."
            rows={3}
            maxLength={PROFILE_LIMITS.noteBody}
            data-testid="profile-add-note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
        {error && <FieldError match>{error}</FieldError>}
      </Field>
      {choice && (
        <Button type="submit" size="sm" className="self-start">
          Add note
        </Button>
      )}
    </form>
  );
}

/*
 * ─── Shared rendering ───────────────────────────────────────────────────────
 */

function labelFor(kind: EntryKind, key: string): string {
  if (kind === "notes") return candidateNoteLabel(key);
  return candidateField(key)?.label ?? key;
}

function renderValue(kind: EntryKind, key: string, value: string): string {
  if (kind === "notes") return value;
  const field = candidateField(key);
  return field === null ? value : displayValue(field, value);
}
