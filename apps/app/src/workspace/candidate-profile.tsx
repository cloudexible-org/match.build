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
 * **It reads as a record, not as a form.** This is the narrowest column on
 * the screen, so a fact is one line — label left, value in a second column
 * you can scan straight down — and the ways to change it (the pencil, the
 * add-a-field control) stay out of the way until you reach for them. The old
 * shape spent three lines and a row of buttons on every fact, which buried
 * five facts under a screenful of chrome.
 *
 * **An agent's open proposals are not here.** They are answered in the stack
 * above the composer (`chat/suggestion-stack.tsx`), where the conversation
 * that produced them is. This section is the record: what is on it, and the
 * ways a matchmaker changes it by hand.
 */

type Entry = {
  value: string;
  source: ProfileValueSource;
  updatedAt: number;
  model?: string;
  sourceQuote?: string;
  confidence?: number;
  // The query also carries `pending`, an agent's open proposal. It is read by
  // the stack above the composer, which is where one is answered, and never
  // here: a proposal is not part of the record.
};

type Entries = Record<string, Entry>;
export type EntryKind = "facts" | "notes";

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
    <div className="flex flex-col gap-6" data-testid="candidate-profile">
      <Facts candidateId={candidateId} entries={profile.facts} />
      <Notes candidateId={candidateId} entries={profile.notes} />
    </div>
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
        <div className="flex flex-col gap-4">
          {groups.map(({ group, fields }) => (
            <section key={group} className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CANDIDATE_GROUP_LABELS[group]}
              </h4>
              {/* `-mx-2` so a row's hover background bleeds into the panel's
                  own padding and reads as a full-width row, the way a list
                  row should. */}
              <ul className="-mx-2 flex flex-col">
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
            </section>
          ))}
        </div>
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

  const source = PROFILE_SOURCE_LABELS[entry.source];

  if (editing) {
    return (
      <li
        className="px-2 py-2"
        data-testid="profile-field"
        data-field={field.key}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-2">
          <Field invalid={error !== null}>
            <FieldLabel>{field.label}</FieldLabel>
            <ValueInput field={field} value={draft} onChange={setDraft} />
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              // Where the value came from is worth knowing exactly when you
              // are about to replace it, and nowhere else.
              <FieldDescription>
                {field.hint ? `${field.hint} · ${source}` : source}
              </FieldDescription>
            )}
          </Field>
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
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
        </form>
      </li>
    );
  }

  return (
    // `relative`: the `sr-only` line below is absolutely positioned, and an
    // absolute box with no positioned ancestor is not clipped by the panel's
    // scroller — it would sit at its static offset in the *document* and give
    // the window a thousand pixels to scroll (`specs/app-convex/layout.spec`).
    <li className="relative" data-testid="profile-field" data-field={field.key}>
      {/* The whole row is the edit control. A narrow column cannot afford a
          permanent pair of buttons per fact, and a row you click to change is
          the thing every records panel already taught people. */}
      <button
        type="button"
        title={source}
        className="group/row flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => {
          setDraft(entry.value);
          setEditing(true);
        }}
      >
        <span className="w-32 shrink-0 text-sm text-muted-foreground">
          {field.label}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm">
          {entry.source !== "matchmaker" && <AssistantMark />}
          {displayValue(field, entry.value)}
          {field.key === "dateOfBirth" && ageOf(entry.value)}
        </span>
        <PencilIcon className="size-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
        {/* The button's name is its content — label, value, then this — so a
            screen reader hears the fact before it hears what the button does.
            An `aria-label` here would replace all of it with "Edit …". */}
        <span className="sr-only">Edit</span>
      </button>
      <span className="sr-only">{source}</span>
      {entry.sourceQuote && (
        <p className="ml-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
          “{entry.sourceQuote}”
        </p>
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
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const available = CANDIDATE_PROFILE_FIELDS.filter(
    (field) => !filled.includes(field.key),
  );
  const field = key ? candidateField(key) : null;
  if (available.length === 0) return null;

  // Folded away by default: a reading surface should not end in a form that
  // is empty nine visits out of ten.
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        data-testid="profile-add-field-open"
        onClick={() => setOpen(true)}
      >
        + Add a field
      </Button>
    );
  }

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
      setOpen(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that."));
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
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
      <div className="flex gap-2">
        {field && (
          <Button type="submit" size="sm">
            Add
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setKey("");
            setDraft("");
            setError(null);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
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
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Notes
      </h4>
      {filled.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
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

  const source = PROFILE_SOURCE_LABELS[entry.source];

  return (
    <li
      // `relative` for the same reason the fact row has it: it contains the
      // absolutely positioned `sr-only` line.
      className="group/note relative rounded-lg border border-border bg-card px-3 py-2.5"
      data-testid="profile-note"
      data-note={noteKey}
    >
      <div className="flex items-center gap-1">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground"
          title={source}
        >
          {entry.source !== "matchmaker" && <AssistantMark />}
          {candidateNoteLabel(noteKey)}
        </span>
        {!editing && (
          // Present but quiet: the note body is what you came to read, and a
          // pair of buttons per note is what made this column a wall of them.
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/note:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Edit"
              title="Edit"
              className="size-7 p-0"
              onClick={() => {
                setDraft(entry.value);
                setEditing(true);
              }}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remove"
              title="Remove"
              className="size-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() =>
                void clear({
                  matchmakerId: workspace.matchmakerId,
                  candidateId,
                  kind: "notes",
                  key: noteKey,
                })
              }
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </span>
        )}
      </div>
      <span className="sr-only">{source}</span>
      {editing ? (
        <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-2">
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
            {error ? (
              <FieldError match>{error}</FieldError>
            ) : (
              <FieldDescription>{source}</FieldDescription>
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
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
          {entry.value}
        </p>
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
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggested = CANDIDATE_PROFILE_NOTES.filter(
    (note) => !filled.includes(note.key),
  );
  const key = choice === CUSTOM_NOTE ? customKey : choice;

  function reset() {
    setChoice("");
    setCustomKey("");
    setBody("");
    setError(null);
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 self-start"
        data-testid="profile-add-note-open"
        onClick={() => setOpen(true)}
      >
        + Add a note
      </Button>
    );
  }

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
      reset();
      setOpen(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save that note."));
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-1 flex flex-col gap-2 rounded-lg border border-border p-3"
      data-testid="profile-add-note-form"
    >
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
      <div className="flex gap-2">
        {choice && (
          <Button type="submit" size="sm">
            Add note
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/*
 * ─── Marks ──────────────────────────────────────────────────────────────────
 */

/**
 * The one piece of provenance worth a pixel in read mode. Whose record it is
 * is the default; that a model touched a value is the exception, and the
 * exception is what a mark is for. The full wording is on the row's `title`,
 * in its `sr-only` line and in the edit form.
 */
function AssistantMark() {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block align-baseline text-xs text-primary"
    >
      ✦
    </span>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M11.3 2.7a1.7 1.7 0 0 1 2.4 2.4L5.6 13.2 2 14l.8-3.6 8.5-7.7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2.5 4h11M6 4V2.5h4V4m-6 0 .6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
 * ─── Shared rendering ───────────────────────────────────────────────────────
 */

export function labelFor(kind: EntryKind, key: string): string {
  if (kind === "notes") return candidateNoteLabel(key);
  return candidateField(key)?.label ?? key;
}

export function renderValue(
  kind: EntryKind,
  key: string,
  value: string,
): string {
  if (kind === "notes") return value;
  const field = candidateField(key);
  return field === null ? value : displayValue(field, value);
}
