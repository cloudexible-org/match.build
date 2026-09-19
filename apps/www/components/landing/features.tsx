"use client";

import {
  Bell,
  ClipboardPaste,
  History,
  MessagesSquare,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { Reveal, revealGroup, revealItem } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { Typography } from "@/components/ui/typography";

const FEATURES = [
  {
    icon: MessagesSquare,
    title: "One chat per candidate",
    description:
      "Each candidate gets one real-time conversation with you, in the app. No more scrolling back through DMs to find what they said.",
  },
  {
    icon: ClipboardPaste,
    title: "Their history comes with them",
    description:
      "Paste in the DM thread when you onboard someone. It opens their conversation, marked as only visible to you.",
  },
  {
    icon: Send,
    title: "Invite by email or link",
    description:
      "Candidates get an invitation with your name on it, or you paste the invite link into the DM. Resend it, revoke it or fix a mistyped email any time.",
  },
  {
    icon: History,
    title: "Notes and a full history",
    description:
      "Private notes on every candidate, plus a record of every change: details edited, invitations sent, who joined and who left.",
  },
  {
    icon: Bell,
    title: "Notified, not spammed",
    description:
      "Push and email tell you a new message is waiting, never what it says. Once you've read the conversation, they stop.",
  },
  {
    icon: Smartphone,
    title: "Built for your phone",
    description:
      "You work between meetings, so every conversation works fully on a phone screen, and the app installs to your home screen.",
  },
] as const;

export function Features(): React.ReactNode {
  return (
    <section
      id="features"
      className="w-full border-border/60 border-t bg-muted/40 px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="What you get"
          title="Everything your DMs can't do."
          lead="A complete inbox for your book from day one. Choosing and introducing people is still your job."
          className="mb-16"
        />

        <motion.div
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </motion.div>

        <ComingNext />
      </div>
    </section>
  );
}

/**
 * The AI features are planned, not shipped. Dashed and tinted, like the
 * suggestion cards they describe, so they never read as part of the list above.
 */
function ComingNext(): React.ReactNode {
  return (
    <Reveal className="mt-10">
      <div
        data-testid="coming-next"
        className="flex flex-col items-start gap-4 rounded-2xl border border-primary/40 border-dashed bg-accent/50 p-6 text-left sm:flex-row sm:items-center sm:p-7"
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium text-primary text-xs uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Coming next
        </span>
        <Typography variant="muted" className="text-[15px] leading-relaxed">
          <span className="font-medium text-foreground">AI assistance.</span>{" "}
          Replies suggested in your voice, and a candidate profile that builds
          itself as they talk. Nothing is sent without you, and if the AI is
          ever down, everything above keeps working.
        </Typography>
      </div>
    </Reveal>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}): React.ReactNode {
  // Track the pointer within the card to light a spotlight at the cursor.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(18rem circle at ${mouseX}px ${mouseY}px, var(--color-primary), transparent 70%)`;

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - bounds.left);
    mouseY.set(event.clientY - bounds.top);
  }

  return (
    <motion.div
      data-testid="feature-card"
      variants={revealItem}
      onMouseMove={handleMouseMove}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 text-left shadow-sm transition-shadow duration-300 hover:shadow-lg"
    >
      <motion.div
        aria-hidden
        style={{ background: spotlight }}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-[0.06]"
      />

      <div className="relative">
        <div className="mb-5 inline-flex items-center justify-center rounded-full bg-accent p-2.5 text-accent-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <Typography
          variant="h3"
          className="mb-2 font-semibold text-card-foreground text-lg"
        >
          {title}
        </Typography>
        <Typography variant="muted" className="text-[15px] leading-relaxed">
          {description}
        </Typography>
      </div>
    </motion.div>
  );
}
