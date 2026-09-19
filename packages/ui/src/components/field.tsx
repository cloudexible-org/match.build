import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Form field parts on Base UI's Field, which wires the label, description and
 * error to the control for assistive technology.
 *
 *   <Field>
 *     <FieldLabel>Email</FieldLabel>
 *     <Input type="email" />
 *     <FieldError />
 *   </Field>
 */

export function Field({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Root>) {
  return (
    <BaseField.Root
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Description>) {
  return (
    <BaseField.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Error>) {
  return (
    <BaseField.Error
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof BaseInput>
>(({ className, ...props }, ref) => (
  <BaseInput
    ref={ref}
    className={cn(
      "h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[invalid]:border-destructive sm:text-sm",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
