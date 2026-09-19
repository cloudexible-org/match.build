import { Field as BaseField } from "@base-ui/react/field";
import * as React from "react";
import { cn } from "../lib/cn";

/**
 * A multi-line text control, rendered through Base UI's Field.Control so a
 * surrounding <Field> labels and describes it like <Input>.
 */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <BaseField.Control
    render={
      <textarea
        ref={ref}
        className={cn(
          "min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[invalid]:border-destructive sm:text-sm",
          className,
        )}
        {...props}
      />
    }
  />
));
Textarea.displayName = "Textarea";
