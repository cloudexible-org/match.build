"use client";

import {
  AtSign,
  BookUser,
  Inbox,
  MessageSquareQuote,
  Smartphone,
  Undo2,
} from "lucide-react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { revealGroup, revealItem } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { Typography } from "@/components/ui/typography";

const FEATURES = [
  {
    icon: Inbox,
    title: "One thread per client",
    description:
      "Email, chat and the original DM, in order, in one conversation. Small channel markers, no separate inboxes.",
  },
  {
    icon: MessageSquareQuote,
    title: "Replies in your voice",
    description:
      "Up to three suggested replies after each message, written the way you write. Send, edit or dismiss them. Nothing goes out on its own.",
  },
  {
    icon: BookUser,
    title: "A profile that builds itself",
    description:
      "Deal-breakers, preferences, lifestyle and logistics are picked up as clients talk. Each fact is saved on its own and linked to the message it came from.",
  },
  {
    icon: Undo2,
    title: "Nothing assumed quietly",
    description:
      "Facts it's sure about are added with a one-tap Undo. Facts it isn't sure about wait for your say-so. When something changes, the old fact is kept, not deleted.",
  },
  {
    icon: AtSign,
    title: "Sent from your domain",
    description:
      "Email goes out as hello@yourbusiness.com, not from a platform address. We walk you through the DNS records, or set them up for you.",
  },
  {
    icon: Smartphone,
    title: "Built for your phone",
    description:
      "You work between meetings, so the conversation view works fully on a phone screen, with the profile one tap away.",
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
          title="Help with the busywork. The taste stays yours."
          lead="The AI keeps notes, drafts and organises. Choosing and introducing people is still your job."
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
      </div>
    </section>
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
