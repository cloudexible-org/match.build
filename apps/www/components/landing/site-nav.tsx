"use client";

import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "motion/react";
import * as React from "react";
import { BrandMark } from "@/components/landing/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
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
          <span className="font-display text-2xl leading-none">Matchmaker</span>
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

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <ButtonLink
            href="/app/"
            variant="ghost"
            size="sm"
            className="hidden rounded-full px-4 sm:inline-flex"
          >
            Sign in
          </ButtonLink>
          <ButtonLink href="#waitlist" size="sm" className="rounded-full px-4">
            Join the waitlist
          </ButtonLink>
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
