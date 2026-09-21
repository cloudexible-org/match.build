import {
  api,
  CANDIDATE_LIMITS,
  candidateEmailError,
  candidateNameError,
  handleError,
  type Id,
  importedHistoryError,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@repo/api";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
} from "@repo/ui";
import { useMutation } from "convex/react";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { serverErrorMessage } from "../lib/server-error";
import { Page, PageHeader } from "../shell/page";
import { useWorkspace } from "../workspace/workspace-layout";

type HandleRow = { key: string; platform: SocialPlatform; handle: string };

type Errors = {
  email?: string;
  name?: string;
  history?: string;
  handles?: Record<string, string>;
  form?: string;
};

/**
 * Onboard a candidate (prd/phase-1.md §3.1): email, optional name, social
 * handles and the pasted DM history, validated with the server's own rules.
 * On success the matchmaker lands in the new conversation; an email already
 * in the book links to that candidate instead.
 */
export function OnboardPage() {
  const workspace = useWorkspace();
  const onboard = useMutation(api.candidates.mutations.onboard);
  const navigate = useNavigate();
  const idPrefix = useId();
  const base = `/mm/${workspace.username}`;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [handles, setHandles] = useState<HandleRow[]>([]);
  const [history, setHistory] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [duplicateOf, setDuplicateOf] = useState<Id<"candidates"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [nextKey, setNextKey] = useState(0);

  function addHandle() {
    setHandles((rows) => [
      ...rows,
      { key: `${idPrefix}-${nextKey}`, platform: "instagram", handle: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  function updateHandle(key: string, patch: Partial<HandleRow>) {
    setHandles((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const handleErrors: Record<string, string> = {};
    for (const row of handles) {
      const error = handleError(row.platform, row.handle);
      if (error) handleErrors[row.key] = error;
    }
    const invalid: Errors = {
      email: candidateEmailError(email) ?? undefined,
      name: candidateNameError(name) ?? undefined,
      history: importedHistoryError(history) ?? undefined,
      handles: handleErrors,
    };
    setErrors(invalid);
    setDuplicateOf(null);
    if (
      invalid.email ||
      invalid.name ||
      invalid.history ||
      Object.keys(handleErrors).length > 0
    ) {
      return;
    }

    setSaving(true);
    try {
      const result = await onboard({
        matchmakerId: workspace.matchmakerId,
        email,
        name,
        socialHandles: handles.map(({ platform, handle }) => ({
          platform,
          handle,
        })),
        importedHistory: history,
      });
      if (result.kind === "duplicate") {
        setDuplicateOf(result.candidateId);
        setSaving(false);
        return;
      }
      navigate(`${base}/c/${result.candidateId}`, { replace: true });
    } catch (error) {
      setErrors({
        form: serverErrorMessage(
          error,
          "We couldn't onboard this candidate. Try again.",
        ),
      });
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Onboard a candidate"
        description="They'll get an invitation to join you on match.build. Until they accept, only you can see anything here."
      />
      <Card>
        <CardContent>
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
            data-testid="onboard-form"
          >
            <Field invalid={errors.email !== undefined || duplicateOf !== null}>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setDuplicateOf(null);
                }}
                autoFocus
              />
              {duplicateOf !== null ? (
                <p
                  className="text-sm text-destructive"
                  data-testid="onboard-duplicate"
                >
                  You already have a candidate with this email.{" "}
                  <Link
                    to={`${base}/c/${duplicateOf}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Open their conversation
                  </Link>
                </p>
              ) : errors.email ? (
                <FieldError match>{errors.email}</FieldError>
              ) : (
                <FieldDescription>Where the invitation goes.</FieldDescription>
              )}
            </Field>

            <Field invalid={errors.name !== undefined}>
              <FieldLabel>Name (optional)</FieldLabel>
              <Input
                autoComplete="off"
                maxLength={CANDIDATE_LIMITS.name + 10}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {errors.name ? (
                <FieldError match>{errors.name}</FieldError>
              ) : (
                <FieldDescription>
                  Your label for them. Blank uses the name on their account.
                </FieldDescription>
              )}
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1.5 text-sm font-medium">
                Social handles (optional)
              </legend>
              {handles.map((row, index) => {
                const error = errors.handles?.[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex flex-col gap-1.5"
                    data-testid="onboard-handle"
                  >
                    <div className="flex gap-2">
                      <Field className="w-36 shrink-0">
                        <FieldLabel className="sr-only">
                          Platform {index + 1}
                        </FieldLabel>
                        <NativeSelect
                          value={row.platform}
                          onChange={(event) =>
                            updateHandle(row.key, {
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
                      <Field className="flex-1" invalid={error !== undefined}>
                        <FieldLabel className="sr-only">
                          Handle {index + 1}
                        </FieldLabel>
                        <Input
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder={
                            row.platform === "whatsapp"
                              ? "+44 7700 900123"
                              : "@handle"
                          }
                          value={row.handle}
                          onChange={(event) =>
                            updateHandle(row.key, {
                              handle: event.target.value,
                            })
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
                    {error && (
                      <p className="text-sm text-destructive">{error}</p>
                    )}
                  </div>
                );
              })}
              {handles.length < CANDIDATE_LIMITS.socialHandles && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={addHandle}
                >
                  Add a handle
                </Button>
              )}
            </fieldset>

            <Field invalid={errors.history !== undefined}>
              <FieldLabel>Existing conversation (optional)</FieldLabel>
              <Textarea
                rows={6}
                value={history}
                onChange={(event) => setHistory(event.target.value)}
              />
              {errors.history ? (
                <FieldError match>{errors.history}</FieldError>
              ) : (
                <FieldDescription>
                  Paste your DMs so far. It starts the thread, and only you can
                  see it.
                </FieldDescription>
              )}
            </Field>

            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link to={base} className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? "Onboarding…" : "Onboard"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}
