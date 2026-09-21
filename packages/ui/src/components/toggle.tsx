import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../lib/cn";

export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      variant: {
        // Off reads as an unpressed button; on reads as a filled one, so the
        // state is legible without the text having to say "on" or "off".
        default:
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:shadow-sm data-[pressed]:hover:bg-primary/90 data-[pressed]:hover:text-primary-foreground",
        outline:
          "border border-input bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:hover:bg-primary/90 data-[pressed]:hover:text-primary-foreground",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ToggleProps
  extends Omit<BaseToggle.Props, "className">,
    VariantProps<typeof toggleVariants> {
  className?: string;
}

/**
 * A two-state button: pressed or not. Base UI writes the pressed state to
 * `aria-pressed` and to a `data-pressed` attribute, which is what the
 * variants style against — so a caller never has to thread the state through
 * `className` by hand.
 *
 * For a labelled on/off control in a form, use a switch instead: this is the
 * toolbar shape, where the label *is* the thing being turned on.
 */
export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, variant, size, ...props }, ref) => (
    <BaseToggle
      ref={ref}
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Toggle.displayName = "Toggle";
