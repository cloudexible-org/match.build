import { Field as BaseField } from "@base-ui/react/field";
import * as React from "react";
import { cn } from "../lib/cn";

/**
 * The platform's own <select>, styled to match <Input>: the right picker on
 * a phone, where a custom listbox is harder to use. Rendered through Base
 * UI's Field.Control so a surrounding <Field> labels it.
 *
 *   <NativeSelect value={v} onChange={…}>
 *     <option value="a">A</option>
 *   </NativeSelect>
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <BaseField.Control
    render={
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[invalid]:border-destructive sm:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    }
  />
));
NativeSelect.displayName = "NativeSelect";
