"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import * as React from "react";
import { ConversationMock } from "@/components/landing/conversation-mock";
import { EASE_OUT, revealGroup, revealItem } from "@/components/landing/reveal";
import { ButtonLink } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";

export function Hero(): React.ReactNode {
  const sectionRef = React.useRef<HTMLElement>(null);

  // Drift the hero up and out as it scrolls away, so the section below feels
  // like it moves over the top of it rather than after it.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      ref={sectionRef}
      id="top"
      className="relative flex min-h-[calc(100svh-4rem)] w-full items-center justify-center overflow-hidden px-4 py-20 sm:px-6"
    >
      <BackdropGlow />

      <motion.div
        data-testid="hero-content"
        style={{ y, opacity }}
        className="relative mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16"
      >
        <motion.div
          variants={revealGroup}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left"
        >
          <motion.div variants={revealItem}>
            <Typography
              variant="small"
              className="inline-block rounded-full bg-accent px-4 py-1.5 font-semibold text-accent-foreground ring-1 ring-primary/15"
            >
              For independent matchmakers
            </Typography>
          </motion.div>

          <motion.div variants={revealItem}>
            <Typography
              variant="h1"
              className="font-display font-normal text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
            >
              Carry a bigger book.{" "}
              <em className="text-primary">Keep the curation.</em>
            </Typography>
          </motion.div>

          <motion.div variants={revealItem}>
            <Typography
              variant="lead"
              data-testid="hero-tagline"
              className="max-w-xl text-lg leading-relaxed sm:text-xl"
            >
              Your business runs on DMs, a spreadsheet and your memory.
              Matchmaker puts every client in one thread, builds their profile
              as they talk, and drafts replies in your voice. You approve every
              word.
            </Typography>
          </motion.div>

          <motion.div
            variants={revealItem}
            className="flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <ButtonLink
              size="lg"
              className="group h-12 rounded-full px-7 text-base"
              href="#waitlist"
            >
              Join the waitlist
              <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink
              variant="outline"
              size="lg"
              className="h-12 rounded-full px-7 text-base"
              href="#how-it-works"
            >
              See how it works
            </ButtonLink>
          </motion.div>
        </motion.div>

        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <ConversationMock />
        </div>
      </motion.div>

      <ScrollCue />
    </section>
  );
}

/**
 * Two slow, offset gradient blooms. They are the only thing on the page that
 * moves without user input, so they stay well under the fold of perception.
 */
function BackdropGlow(): React.ReactNode {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <motion.div
        animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
        transition={{
          duration: 18,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        className="absolute top-[-10%] left-[10%] h-[32rem] w-[32rem] rounded-full bg-primary/15 blur-[120px]"
      />
      <motion.div
        animate={{ x: [0, -50, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{
          duration: 22,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        className="absolute right-[5%] bottom-[-15%] h-[28rem] w-[28rem] rounded-full bg-chart-1/30 blur-[120px]"
      />
    </div>
  );
}

function ScrollCue(): React.ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2, duration: 0.6, ease: EASE_OUT }}
      className="-translate-x-1/2 absolute bottom-6 left-1/2 hidden lg:block"
    >
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      >
        <ChevronDown className="h-5 w-5 text-muted-foreground" aria-hidden />
      </motion.div>
    </motion.div>
  );
}
