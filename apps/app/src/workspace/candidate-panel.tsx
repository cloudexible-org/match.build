import {
  api,
  CANDIDATE_LIMITS,
  candidateNameError,
  handleError,
  type Id,
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
} from "@repo/ui";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { serverErrorMessage } from "../lib/server-error";
import { PanelHeader } from "../shell/panel-header";
import { CandidateHistory } from "./candidate-history";
import { type Membership, membershipMarker } from "./candidate-labels";
import { CandidateMatches } from "./candidate-matches";
import { CandidateProfile } from "./candidate-profile";
import {
  ChevronDownIcon,
  RecordEditRow,
  RecordGroup,
  RecordRow,
} from "./panel-record";
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
 * The candidate panel (prd/phase-1.md §4.1, prd/phase-2.md §5): Details,
 * Profile and History — everything the matchmaker knows about one person that
 * isn't the thread. Private to them: a candidate has no route to any of it,
 * including to their own profile (prd/phase-2.md §7).
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
      <PanelHeader
        title={`About ${candidate.name ?? candidate.email}`}
        onClose={onClose}
        closeTestId="close-candidate-panel"
      />
      {/* Sections rather than tabs: a matchmaker reading a thread wants the
          details and what they know at once, not one at a time. They scroll as
          this column, under its header — never as the page.

          No header of its own from `lg` up, so the divider under the first
          section *is* this column's first rule, and it lines up with the other
          two columns' header borders because an accordion trigger and
          `COLUMN_HEADER` are both 44px (`shell/chat-shell.tsx`).

          Details stays open by default: who they are, where they stand and
          whether they're still active is what you want on opening a thread
          you haven't touched in a week (the invite controls themselves are in
          the banner over the thread, where the thread is blocked on them).
          Profile is the deeper reading surface (prd/phase-2.md §5). */}
      <Accordion
        defaultValue={["details"]}
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="candidate-panel-scroll"
      >
        {/* First: a match is the thing the whole product is for, and a
            matchmaker opening someone's file wants to know whether there is
            one before they want anything else. Closed by default all the
            same — Details is what you need on a thread you haven't touched in
            a week. */}
        <AccordionSection value="matches" title="Matches">
          <CandidateMatches candidateId={candidate.candidateId} />
        </AccordionSection>
        <AccordionSection value="details" title="Details">
          <Details candidate={candidate} />
        </AccordionSection>
        <AccordionSection value="profile" title="Profile">
          <CandidateProfile candidateId={candidate.candidateId} />
        </AccordionSection>
        <AccordionSection value="history" title="History">
          <CandidateHistory candidateId={candidate.candidateId} />
        </AccordionSection>
      </Accordion>
    </div>
  );
}

type Handle = { platform: SocialPlatform; handle: string };

/**
 * Who this person is, as a record rather than a form (prd/phase-1.md §4.1).
 *
 * It used to be a standing form — a name box, a stack of handle rows each
 * with its own select, input and ✕, a **Save details** button and a status
 * line — about 480px of controls for five things worth knowing. Details is
 * the section a matchmaker lands on when they open a thread they haven't
 * touched in a week, and what they want from it is to *read* it.
 *
 * So it uses the panel's rows (`panel-record.tsx`), the same ones Profile
 * does: one line each, and the ones you can change are a row you click. Email
 * and membership have no pencil, because the matchmaker cannot change them
 * here and a row that looks editable and isn't is worse than a plain line.
 *
 * **Every write sends both halves**, because `updateDetails` takes the name
 * and the whole handle list together; each row reads the other half off the
 * candidate rather than out of a draft it has been holding since mount, which
 * is also how an edit made in another tab stops being silently overwritten.
 */
function Details({ candidate }: { candidate: PanelCandidate }) {
  const workspace = useWorkspace();
  const update = useMutation(api.candidates.mutations.updateDetails);
  const setStatus = useMutation(api.candidates.mutations.setStatus);

  function saveDetails(next: { name?: string; socialHandles?: Handle[] }) {
    return update({
      matchmakerId: workspace.matchmakerId,
      candidateId: candidate.candidateId,
      name: next.name ?? candidate.name ?? "",
      socialHandles: next.socialHandles ?? candidate.socialHandles,
    });
  }

  const marker = membershipMarker(candidate.membership);
  return (
    <div className="flex flex-col gap-4">
      <RecordGroup>
        <NameRow candidate={candidate} onSave={saveDetails} />
        <RecordRow
          testId="candidate-detail"
          field="email"
          label="Email"
          value={<span data-testid="candidate-email">{candidate.email}</span>}
        />
        {candidate.acceptedAs !== undefined && (
          <RecordRow
            testId="candidate-detail"
            field="acceptedAs"
            label="Accepted as"
            value={candidate.acceptedAs}
          />
        )}
        <RecordRow
          testId="candidate-detail"
          field="membership"
          label="Membership"
          value={
            <span data-testid="candidate-membership">{marker ?? "Joined"}</span>
          }
        />
        <RecordRow
          testId="candidate-detail"
          field="status"
          label="Status"
          // A select rather than a row you click: status is a closed list of
          // three and takes effect the moment it changes, so there is nothing
          // for a Save button to do. Stripped of its box so it reads as the
          // row's value, with a chevron of our own saying it is a control.
          //
          // **`appearance-none`, and the arrow drawn by hand.** A native
          // select insets its text by an amount that is the browser's, not
          // ours, and no padding we set takes it back — the value sat a few
          // pixels left of every other value in the column, by a different
          // few pixels per browser. Dropping the native appearance drops the
          // inset with it, and then the text starts exactly where `Joined`
          // above it does.
          value={
            <Field className="relative w-fit max-w-full">
              <FieldLabel className="sr-only">Status</FieldLabel>
              <NativeSelect
                className="h-auto w-auto max-w-full appearance-none rounded-sm border-0 bg-transparent px-0 pe-5 py-0 text-sm shadow-none"
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
              <ChevronDownIcon className="pointer-events-none absolute end-0 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            </Field>
          }
        />
      </RecordGroup>

      <div className="flex flex-col gap-2">
        <RecordGroup title="Social handles">
          {candidate.socialHandles.map((row, index) => (
            <HandleRow
              // The list has no ids of its own and is short and ordered;
              // its position is what identifies a row here.
              key={index}
              row={row}
              index={index}
              handles={candidate.socialHandles}
              onSave={saveDetails}
            />
          ))}
        </RecordGroup>
        <AddHandle handles={candidate.socialHandles} onSave={saveDetails} />
      </div>
    </div>
  );
}

type SaveDetails = (next: {
  name?: string;
  socialHandles?: Handle[];
}) => Promise<unknown>;

function NameRow({
  candidate,
  onSave,
}: {
  candidate: PanelCandidate;
  onSave: SaveDetails;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.name ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = candidateNameError(draft);
    setError(invalid);
    if (invalid) return;
    try {
      await onSave({ name: draft });
      setEditing(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
    }
  }

  if (!editing) {
    return (
      <RecordRow
        testId="candidate-detail"
        field="name"
        label="Name"
        // Nobody named them yet, so the list is calling them by their email;
        // say that rather than leaving the row blank.
        value={
          candidate.name ?? (
            <span className="text-muted-foreground">{candidate.email}</span>
          )
        }
        onEdit={() => {
          setDraft(candidate.name ?? "");
          setError(null);
          setEditing(true);
        }}
      />
    );
  }

  return (
    <RecordEditRow testId="candidate-detail" field="name">
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-2"
        data-testid="candidate-name-form"
      >
        <Field invalid={error !== null}>
          <FieldLabel>Name</FieldLabel>
          <Input
            maxLength={CANDIDATE_LIMITS.name + 10}
            value={draft}
            placeholder={candidate.email}
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
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </RecordEditRow>
  );
}

function HandleRow({
  row,
  index,
  handles,
  onSave,
}: {
  row: Handle;
  index: number;
  handles: Handle[];
  onSave: SaveDetails;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Handle>(row);
  const [error, setError] = useState<string | null>(null);

  async function write(next: Handle[]) {
    try {
      await onSave({ socialHandles: next });
      setEditing(false);
      return true;
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
      return false;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = handleError(draft.platform, draft.handle);
    setError(invalid);
    if (invalid) return;
    await write(handles.map((other, at) => (at === index ? draft : other)));
  }

  if (!editing) {
    return (
      <RecordRow
        testId="details-handle"
        field={row.platform}
        label={SOCIAL_PLATFORM_LABELS[row.platform]}
        value={row.handle}
        onEdit={() => {
          setDraft(row);
          setError(null);
          setEditing(true);
        }}
      />
    );
  }

  return (
    <RecordEditRow testId="details-handle" field={row.platform}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-2">
        <HandleFields value={draft} onChange={setDraft} error={error} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => void write(handles.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </div>
      </form>
    </RecordEditRow>
  );
}

function AddHandle({
  handles,
  onSave,
}: {
  handles: Handle[];
  onSave: SaveDetails;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Handle>({
    platform: "instagram",
    handle: "",
  });
  const [error, setError] = useState<string | null>(null);

  if (handles.length >= CANDIDATE_LIMITS.socialHandles) return null;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        data-testid="details-add-handle-open"
        onClick={() => setOpen(true)}
      >
        + Add a handle
      </Button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = handleError(draft.platform, draft.handle);
    setError(invalid);
    if (invalid) return;
    try {
      await onSave({ socialHandles: [...handles, draft] });
      setDraft({ platform: "instagram", handle: "" });
      setOpen(false);
    } catch (caught) {
      setError(serverErrorMessage(caught, "We couldn't save. Try again."));
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      // `relative` for the `sr-only` labels inside: an absolute box with no
      // positioned ancestor escapes the panel's scroller and stretches the
      // document (`specs/app-convex/layout.spec.ts`).
      className="relative flex flex-col gap-2 rounded-lg border border-border p-3"
      data-testid="details-add-handle-form"
    >
      <HandleFields
        label="Add a handle"
        value={draft}
        onChange={setDraft}
        error={error}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
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
 * The platform and the handle, the pair every handle form is made of.
 *
 * **Two `Field`s, not one round both controls.** Base UI's Field labels the
 * one control inside it, so a Field holding a select *and* an input points
 * both at the same label — the select's own `aria-label` loses to the
 * inherited `aria-labelledby`, and "Platform" and "Handle" both resolve to two
 * elements.
 */
function HandleFields({
  label,
  value,
  onChange,
  error,
}: {
  label?: string;
  value: Handle;
  onChange: (next: Handle) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium">{label}</span>}
      <div className="flex gap-2">
        <Field className="w-28 shrink-0">
          <FieldLabel className="sr-only">Platform</FieldLabel>
          <NativeSelect
            value={value.platform}
            onChange={(event) =>
              onChange({
                ...value,
                platform: event.target.value as SocialPlatform,
              })
            }
          >
            {SOCIAL_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {SOCIAL_PLATFORM_LABELS[platform]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field className="min-w-0 flex-1" invalid={error !== null}>
          <FieldLabel className="sr-only">Handle</FieldLabel>
          <Input
            value={value.handle}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...value, handle: event.target.value })
            }
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
