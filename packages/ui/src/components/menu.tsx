import { Menu as BaseMenu } from "@base-ui/react/menu";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * A dropdown menu on Base UI: keyboard navigation, focus return, outside
 * click and ARIA included.
 *
 *   <Menu trigger={<Button variant="ghost">⋯</Button>}>
 *     <MenuItem onClick={leave}>Leave Jane</MenuItem>
 *   </Menu>
 *
 * The trigger is whatever element is passed, so it keeps its own styling;
 * `render` hands it Base UI's props rather than wrapping it in another button.
 * The popup is portalled, so a menu inside a clipped or scrolling column is
 * not cut off by it.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  children: React.ReactNode;
  /** Which end of the trigger the popup lines up with. Default: "end". */
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} sideOffset={6} className="z-50">
          <BaseMenu.Popup
            className={cn(
              "min-w-40 max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg outline-none",
              className,
            )}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** One row, whether it does something or goes somewhere. */
const ITEM =
  "flex w-full cursor-default select-none items-center rounded-sm px-3 py-2 text-left text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

export function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Item>) {
  return <BaseMenu.Item className={cn(ITEM, className)} {...props} />;
}

/**
 * An item that navigates rather than acts, so it is a real link: middle-click,
 * open in a new tab and the browser's own status bar all work.
 *
 *   <MenuLinkItem render={<Link to="/settings" />}>Settings</MenuLinkItem>
 *
 * `closeOnClick`, which Base UI leaves off by default — a menu still standing
 * over the page you just asked for is a menu you have to dismiss twice.
 */
export function MenuLinkItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.LinkItem>) {
  return (
    <BaseMenu.LinkItem
      closeOnClick
      className={cn(ITEM, className)}
      {...props}
    />
  );
}

/**
 * A set of items with a heading — "Maya Maker" over what belongs to that
 * account. The label is read out as the group's name rather than sitting in
 * the item list as a row nobody can select.
 */
export function MenuGroup({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Group>) {
  return <BaseMenu.Group className={cn("py-1", className)} {...props} />;
}

export function MenuGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.GroupLabel>) {
  return (
    <BaseMenu.GroupLabel
      className={cn(
        "truncate px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A rule between groups. */
export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Separator>) {
  return (
    <BaseMenu.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
