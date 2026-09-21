import { useAuthActions } from "@convex-dev/auth/react";
import {
  Button,
  buttonVariants,
  cn,
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
} from "@repo/ui";
import { Link } from "react-router";
import { HeaderNotifications } from "../notifications/header-notifications";
import { ThemeToggle } from "./theme-toggle";

/**
 * Top bar for signed-in pages: brand, where you are, where you can go, and
 * sign out.
 *
 * Its links are **passed as data rather than as markup**, because the header
 * lays the same set out twice: in a row on a wide screen, and inside one menu
 * below `md`, where a row of them and the controls beside it no longer fit at
 * 380px. Two hand-written copies would be two things to keep in step.
 *
 * Full width on every page, whatever the page under it is: the header is
 * the app's frame rather than part of the page, and a frame that changes
 * width as you navigate reads as the page jumping.
 */

/** Somewhere the header can take you. */
export type HeaderLink = {
  to: string;
  label: string;
  testId?: string;
};

/**
 * The way into `/settings`, on every page. Labelled for the page it opens
 * rather than for whose account it is: it used to wear the account holder's
 * name, which beside a workspace's own **Profile settings** read as a second
 * profile rather than as this account's settings.
 */
const ACCOUNT_SETTINGS: HeaderLink = {
  to: "/settings",
  label: "Account settings",
  testId: "header-account-settings",
};

/** Below this the links fold into the menu. Tailwind's `md`. */
const INLINE = "hidden md:inline-flex";

export function AppHeader({
  name,
  workspace,
  links = [],
}: {
  /**
   * The signed-in account. Named at the top of the menu, which is the only
   * place the header says whose account these settings are.
   */
  name: string;
  /** The workspace this page is inside, where it is inside one. */
  workspace?: { to: string; label: string };
  /** Where that workspace can take you. */
  links?: readonly HeaderLink[];
}) {
  const { signOut } = useAuthActions();
  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        {/* The brand and workspace name give way; the controls on the right
            can't shrink, and at 380px something has to. Inside a workspace the
            brand goes first: its nav is where you are and where you can go,
            and the name of the product is neither. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            to="/"
            className={cn(
              "truncate font-display text-xl",
              workspace !== undefined && "hidden sm:inline",
            )}
          >
            match.build
          </Link>
          {workspace !== undefined && (
            <nav className="flex min-w-0 items-center gap-1 text-sm">
              {/* Separates the workspace from the brand, so it goes with it. */}
              <span
                aria-hidden
                className="hidden text-muted-foreground sm:inline"
              >
                /
              </span>
              <Link
                to={workspace.to}
                className="truncate rounded-md px-2 py-1 font-medium hover:bg-accent"
                data-testid="workspace-name"
              >
                {workspace.label}
              </Link>
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    INLINE,
                  )}
                  data-testid={link.testId}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to={ACCOUNT_SETTINGS.to}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              INLINE,
              "text-muted-foreground",
            )}
            data-testid={ACCOUNT_SETTINGS.testId}
          >
            {ACCOUNT_SETTINGS.label}
          </Link>
          {/* Notifications and the theme stay out of the menu at every width:
              a bell that only shows it has something once you open a menu is
              not telling you. */}
          <HeaderNotifications />
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className={INLINE}
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
          <HeaderMenu
            name={name}
            links={[...links, ACCOUNT_SETTINGS]}
            onSignOut={() => void signOut()}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * Everything the row above holds, in one menu, below `md`.
 *
 * The account's name labels the group rather than being an item of it: it is
 * whose these are, not somewhere to go. Its items carry `-menu` test ids of
 * their own, so a test at phone width picks the menu's copy and never matches
 * both.
 */
function HeaderMenu({
  name,
  links,
  onSignOut,
}: {
  name: string;
  links: readonly HeaderLink[];
  onSignOut: () => void;
}) {
  return (
    <Menu
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="px-2 md:hidden"
          aria-label="Menu"
          data-testid="header-menu"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </Button>
      }
    >
      <MenuGroup>
        <MenuGroupLabel data-testid="header-menu-account">
          {name}
        </MenuGroupLabel>
        {links.map((link) => (
          <MenuLinkItem
            key={link.to}
            render={<Link to={link.to} />}
            data-testid={
              link.testId === undefined ? undefined : `${link.testId}-menu`
            }
          >
            {link.label}
          </MenuLinkItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem onClick={onSignOut} data-testid="header-sign-out-menu">
        Sign out
      </MenuItem>
    </Menu>
  );
}
