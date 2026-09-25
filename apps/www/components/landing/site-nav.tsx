"use client";

import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "motion/react";
import * as React from "react";
import { BrandMark } from "@/components/landing/brand-mark";
import { MobileNav, type NavLink } from "@/components/landing/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The section links. Shown as a row from `md` up and inside `MobileNav` below
 * it — one list, so a section added here cannot reach only half the visitors.
 */
const LINKS: readonly NavLink[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
] as const;

export function SiteNav(): React.ReactNode {
  const [isScrolled, setIsScrolled] = React.useState(false);

  const { scrollYProgress, scrollY } = useScroll();
  // Spring the raw progress so the bar trails the scroll slightly instead of
  // snapping, which matches the weight Lenis gives the page itself.
  const progress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 8);
  });

  return (
    <motion.nav
      data-testid="site-nav"
      aria-label="Main"
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-background/75 backdrop-blur transition-colors duration-300",
        isScrolled ? "border-border/60" : "border-transparent",
      )}
    >
      {/*
        The tightening below 360px is for the 320px class of screen, where the
        bar has never fitted: the brand and the waitlist CTA alone are wider
        than the room between the gutters, and the page scrolled sideways. Held
        behind `min-[360px]` rather than `sm` so that every mainstream phone —
        360 and up — keeps the bar at full size.
      */}
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 min-[360px]:gap-4 min-[360px]:px-4 sm:px-6">
        <a
          href="#top"
          className="flex items-center gap-2 text-foreground"
          data-testid="brand-link"
        >
          <motion.span
            whileHover={{ rotate: -12, scale: 1.08 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="rounded-full bg-primary p-1.5 text-primary-foreground shadow-sm"
          >
            <BrandMark className="h-4 w-4" />
          </motion.span>
          <span className="font-display text-xl leading-none min-[360px]:text-2xl">
            match.build
          </span>
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-full px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/*
          Everything but the brand, the waitlist CTA and the menu button is
          `md`-and-up. The bar is 375px wide at its narrowest and the brand and
          that CTA already claim 260 of it, so what is left is one control —
          and it has to be the one that leads to all the others.
        */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle className="hidden md:inline-flex" />
          <ButtonLink
            href="/app/"
            variant="ghost"
            size="sm"
            className="hidden rounded-full px-4 md:inline-flex"
            aria-label="Sign in / Sign up"
          >
            {/* The full label crowds the section links onto three lines
                between `md` and `lg`; the name stays whole for a reader. */}
            <span className="lg:hidden">Sign in</span>
            <span className="hidden lg:inline">Sign in / Sign up</span>
          </ButtonLink>
          <ButtonLink href="#waitlist" size="sm" className="rounded-full px-4">
            Join the waitlist
          </ButtonLink>
          <MobileNav links={LINKS} />
        </div>
      </div>

      {/* Reading progress for the full page. */}
      <motion.div
        data-testid="reading-progress"
        style={{ scaleX: progress }}
        className="absolute bottom-0 left-0 h-px w-full origin-left bg-gradient-to-r from-primary/40 to-primary"
      />
    </motion.nav>
  );
}
