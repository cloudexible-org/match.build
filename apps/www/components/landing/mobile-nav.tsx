"use client";

import { Menu } from "@base-ui/react/menu";
import { MenuIcon, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One entry in the nav — the shape `SiteNav` keeps its `LINKS` in. */
export type NavLink = { readonly href: string; readonly label: string };

/**
 * One row. `py-2.5` puts a row at 40px, which is the smallest thing worth
 * aiming a thumb at, and `rounded-full` matches the pill the same links wear
 * in the desktop bar.
 */
const ITEM =
  "flex w-full cursor-default select-none items-center justify-between gap-3 rounded-full px-3.5 py-2.5 text-left text-muted-foreground text-sm no-underline outline-none transition-colors data-[highlighted]:bg-secondary data-[highlighted]:text-foreground";

/**
 * The nav, for a phone.
 *
 * Below `md` the section links are hidden, and there was never room in the bar
 * for the brand, the waitlist CTA and everything else besides — which is how
 * "Sign in" came to be *unreachable* on a phone rather than merely tucked
 * away: it was `hidden sm:inline-flex`, so on a 375px screen the only route
 * into the app was knowing the `/app/` URL. This is that route.
 *
 * Base UI's `Menu` rather than a hand-rolled panel: it brings the keyboard
 * navigation, focus return, outside-click dismissal and ARIA wiring that a
 * `useState` toggle over a `<div>` does not, and the popup is portalled, so
 * the nav's own `backdrop-blur` cannot flatten it.
 *
 * The popup is unmounted while closed (Base UI's default), so nothing in here
 * renders during SSR and `resolvedTheme` is always settled by the time the
 * theme row is read — no `mounted` guard needed, unlike `ThemeToggle`.
 */
export function MobileNav({
  links,
}: {
  links: readonly NavLink[];
}): React.ReactNode {
  const [open, setOpen] = React.useState(false);
  // `resolvedTheme`, for the reason `ThemeToggle` gives: with
  // `defaultTheme="system"` the raw `theme` is the literal string "system", so
  // the first press would set the theme it already was.
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full md:hidden"
            data-testid="mobile-nav-trigger"
          >
            {open ? (
              <X className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
            <span className="sr-only">Menu</span>
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup
            data-testid="mobile-nav"
            className="w-56 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] rounded-2xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            {links.map((link) => (
              <Menu.LinkItem
                key={link.href}
                href={link.href}
                closeOnClick
                className={ITEM}
              >
                {link.label}
              </Menu.LinkItem>
            ))}

            <Menu.Separator className="my-1.5 h-px bg-border/60" />

            {/* The reason this component exists. */}
            <Menu.LinkItem
              href="/app/"
              closeOnClick
              className={cn(ITEM, "font-medium text-foreground")}
            >
              Sign in
            </Menu.LinkItem>

            {/*
              The theme control lives here below `md` rather than in the bar:
              at 375px the bar has ~41px of slack and an icon button plus its
              gap wants 44px, so something had to give — and the theme is the
              one thing in the bar that is a preference rather than a
              destination. `closeOnClick={false}` so the menu stays put while
              the page changes colour behind it.
            */}
            <Menu.Item
              closeOnClick={false}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={ITEM}
            >
              {isDark ? "Light theme" : "Dark theme"}
              {isDark ? (
                <Sun className="h-4 w-4 shrink-0" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
