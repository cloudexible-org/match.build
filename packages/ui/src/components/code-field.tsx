import { OTPField } from "@base-ui/react/otp-field";
import type * as React from "react";
import { cn } from "../lib/cn";

export interface CodeFieldProps
  extends Omit<
    React.ComponentProps<typeof OTPField.Root>,
    "children" | "className"
  > {
  length: number;
  className?: string;
}

/**
 * A one-time code entry: one slot per character, paste- and autofill-aware
 * (`autocomplete="one-time-code"`). Wrap it in `<Field>` with a `<FieldLabel>`;
 * the first slot takes the field's label and the rest announce their position.
 */
export function CodeField({ length, className, ...props }: CodeFieldProps) {
  return (
    <OTPField.Root
      length={length}
      className={cn("flex gap-2", className)}
      {...props}
    >
      {Array.from({ length }, (_, index) => (
        <OTPField.Input
          // Slots are positional and never reorder.
          key={index}
          aria-label={
            index === 0 ? undefined : `Character ${index + 1} of ${length}`
          }
          className="h-12 w-10 rounded-md border border-input bg-card text-center text-lg font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[invalid]:border-destructive"
        />
      ))}
    </OTPField.Root>
  );
}
