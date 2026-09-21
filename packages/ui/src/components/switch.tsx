import { Switch as BaseSwitch } from "@base-ui/react/switch";
import * as React from "react";
import { cn } from "../lib/cn";

export interface SwitchProps
  extends Omit<BaseSwitch.Root.Props, "className" | "render"> {
  className?: string;
  /** For the thumb, on the rare occasion the track alone isn't enough. */
  thumbClassName?: string;
}

/**
 * An on/off switch: `Switch.Root` and its thumb, as one element, because a
 * caller has no use for a track without one.
 *
 * **It has to be labelled.** Base UI renders a `<span>` with `role="switch"`
 * beside a hidden input, and wires the name from a wrapping `<label>` — so
 * `<label><Switch /> Notifications</label>` names it, and a bare `<Switch />`
 * is a control a screen reader can only call "switch".
 *
 * For a control whose *label* is the thing being turned on — a toolbar's
 * bold, a filter — a pressed button is the better shape; this is the one for
 * a setting that is on or off.
 */
export const Switch = React.forwardRef<HTMLElement, SwitchProps>(
  ({ className, thumbClassName, ...props }, ref) => (
    <BaseSwitch.Root
      ref={ref}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[checked]:bg-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "size-4 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-4",
          thumbClassName,
        )}
      />
    </BaseSwitch.Root>
  ),
);
Switch.displayName = "Switch";
