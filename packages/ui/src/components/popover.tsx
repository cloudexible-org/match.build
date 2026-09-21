import { Popover as BasePopover } from "@base-ui/react/popover";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * An overlay anchored to its trigger, on Base UI: outside click, Escape,
 * focus return and ARIA included.
 *
 *   <Popover trigger={<Button variant="ghost">Notifications</Button>}>
 *     <PopoverTitle>Notifications</PopoverTitle>
 *     …
 *   </Popover>
 *
 * The difference from `Menu` is what goes inside: a menu holds items you pick
 * one of, a popover holds a panel — a heading, a list, a button of its own.
 * Use `Menu` for a list of commands and this for anything with structure.
 *
 * The trigger is whatever element is passed, so it keeps its own styling, and
 * the popup is portalled so a panel inside a scrolling column isn't clipped.
 * `collisionPadding` keeps it off the viewport edge on a phone, where a panel
 * anchored to a control in the top right would otherwise run off the screen.
 */
export function Popover({
  trigger,
  children,
  align = "end",
  className,
  open,
  onOpenChange,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  children: React.ReactNode;
  /** Which end of the trigger the popup lines up with. Default: "end". */
  align?: "start" | "center" | "end";
  className?: string;
  /** Controlled open state. Leave unset for an uncontrolled popover. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <BasePopover.Popup
            className={cn(
              "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none",
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/**
 * The panel's heading. Base UI names the popup by it, so a panel with one of
 * these announces itself rather than being an unnamed dialog.
 */
export function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof BasePopover.Title>) {
  return (
    <BasePopover.Title
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

/*
 * No `Close` is exported: Base UI's stamps button semantics onto whatever it
 * renders, so a link inside a popup would stop being a link. Control `open`
 * instead — that is what the prop is for.
 */
