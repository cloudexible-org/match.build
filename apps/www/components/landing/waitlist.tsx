"use client";

import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import {
  api,
  emailError,
  instagramError,
  nameError,
  WAITLIST_LIMITS,
} from "@repo/api";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { EASE_OUT, Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";

/**
 * The Convex client queues a mutation until it connects, so an unreachable
 * backend would otherwise leave the button spinning forever. The mutation is
 * idempotent, so a late success after this fires is harmless.
 */
const SUBMIT_TIMEOUT_MS = 15_000;

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

function readString(values: Form.Values, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value : "";
}

export function Waitlist(): React.ReactNode {
  const join = useMutation(api.waitlist.mutations.join);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  // Read through a ref: Base UI's `onFormSubmit` values only include inputs
  // registered with a `Field`, so the honeypot never appears in them.
  const honeypotRef = React.useRef<HTMLInputElement>(null);

  async function handleSubmit(values: Form.Values): Promise<void> {
    // Honeypot: a field people never see. Bots fill it; pretend it worked.
    if (honeypotRef.current?.value) {
      setStatus({ kind: "done" });
      return;
    }

    setStatus({ kind: "submitting" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        join({
          email: readString(values, "email"),
          name: readString(values, "name") || undefined,
          instagram: readString(values, "instagram") || undefined,
          source: "landing",
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("timeout")),
            SUBMIT_TIMEOUT_MS,
          );
        }),
      ]);
      setStatus({ kind: "done" });
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        message:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : "We couldn't reach the server. Please try again in a moment.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    <section
      id="waitlist"
      data-testid="waitlist"
      className="relative w-full overflow-hidden px-4 py-24 sm:px-6 sm:py-32"
    >
      <div
        aria-hidden
        className="-translate-x-1/2 pointer-events-none absolute bottom-0 left-1/2 h-[26rem] w-[40rem] max-w-full rounded-full bg-primary/15 blur-[130px]"
      />

      <div className="relative mx-auto flex max-w-xl flex-col items-center gap-10 text-center">
        <Reveal className="flex flex-col items-center gap-4">
          <Typography
            variant="small"
            className="font-semibold text-primary uppercase tracking-widest"
          >
            Early access
          </Typography>
          <Typography
            variant="h2"
            className="border-none pb-0 font-display font-normal text-4xl tracking-normal sm:text-5xl"
          >
            Help us build it
          </Typography>
          <Typography variant="lead" className="text-lg">
            We're onboarding a handful of independent matchmakers first, one at
            a time. Leave your details and we'll be in touch.
          </Typography>
        </Reveal>

        <Reveal className="w-full" delay={0.1}>
          <div className="w-full rounded-2xl border border-border bg-card p-6 text-left shadow-primary/5 shadow-xl sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              {status.kind === "done" ? (
                <motion.div
                  key="done"
                  data-testid="waitlist-success"
                  role="status"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  className="flex flex-col items-center gap-3 py-6 text-center"
                >
                  <CheckCircle2
                    className="h-10 w-10 text-primary"
                    aria-hidden
                  />
                  <p className="font-display text-3xl text-card-foreground">
                    You're on the list.
                  </p>
                  <Typography variant="muted" className="text-base">
                    We'll email you personally when there's a place for you.
                  </Typography>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                >
                  <Form
                    data-testid="waitlist-form"
                    onFormSubmit={handleSubmit}
                    className="flex flex-col gap-5"
                  >
                    <TextField
                      name="email"
                      label="Email"
                      placeholder="you@yourbusiness.com"
                      autoComplete="email"
                      inputMode="email"
                      maxLength={WAITLIST_LIMITS.email}
                      validate={emailError}
                    />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField
                        name="name"
                        label="Name"
                        optional
                        placeholder="Your name"
                        autoComplete="name"
                        maxLength={WAITLIST_LIMITS.name}
                        validate={nameError}
                      />
                      <TextField
                        name="instagram"
                        label="Instagram"
                        optional
                        placeholder="@yourhandle"
                        autoComplete="off"
                        maxLength={WAITLIST_LIMITS.instagram + 30}
                        validate={instagramError}
                      />
                    </div>

                    {/* Honeypot — off-screen and unfocusable, so only bots fill it. */}
                    <input
                      ref={honeypotRef}
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden
                      className="-left-[9999px] absolute h-px w-px opacity-0"
                    />

                    {status.kind === "error" ? (
                      <p
                        role="alert"
                        data-testid="waitlist-error"
                        className="text-destructive text-sm"
                      >
                        {status.message}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      size="lg"
                      disabled={status.kind === "submitting"}
                      className="group mt-1 h-12 w-full rounded-full text-base"
                    >
                      {status.kind === "submitting" ? (
                        <>
                          <Loader2
                            className="mr-2 h-4 w-4 animate-spin"
                            aria-hidden
                          />
                          Joining…
                        </>
                      ) : (
                        <>
                          Join the waitlist
                          <ArrowRight
                            className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                            aria-hidden
                          />
                        </>
                      )}
                    </Button>
                    <Typography variant="muted" className="text-center text-xs">
                      We'll only use your email to contact you about
                      match.build.
                    </Typography>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TextField({
  name,
  label,
  optional = false,
  validate,
  ...inputProps
}: {
  name: string;
  label: string;
  optional?: boolean;
  validate: (value: string) => string | null;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "placeholder" | "autoComplete" | "inputMode" | "maxLength"
>): React.ReactNode {
  return (
    <Field.Root
      name={name}
      validate={(value) => validate(typeof value === "string" ? value : "")}
      className="flex flex-col gap-1.5"
    >
      <Field.Label className="font-medium text-card-foreground text-sm">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-muted-foreground">
            (optional)
          </span>
        ) : null}
      </Field.Label>
      <Field.Control
        type="text"
        {...inputProps}
        className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/30 data-[invalid]:border-destructive"
      />
      <Field.Error className="text-destructive text-sm" />
    </Field.Root>
  );
}
