"use client";

import { ClipboardPaste, MessagesSquare, PenLine } from "lucide-react";
import { motion } from "motion/react";
import { revealGroup, revealItem } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { Typography } from "@/components/ui/typography";

const STEPS = [
  {
    icon: ClipboardPaste,
    title: "Paste the DM",
    body: "When a conversation on Instagram or WhatsApp turns serious, ask for their email. Paste it and the chat so far into Matchmaker. It picks up their name and the first facts about them.",
  },
  {
    icon: PenLine,
    title: "Approve the first email",
    body: "Matchmaker drafts a warm first email that carries on from the DM, in your voice. You edit it, approve it, and it goes out from your own domain.",
  },
  {
    icon: MessagesSquare,
    title: "Keep it in one thread",
    body: "Clients reply by email or in a simple chat that opens from a link, with no app to download. Every message, from any channel, lands in the same thread.",
  },
] as const;

export function HowItWorks(): React.ReactNode {
  return (
    <section
      id="how-it-works"
      data-testid="how-it-works"
      className="w-full px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title="From a DM to a client in three steps"
          lead="Keep meeting people where you already do. Matchmaker takes over once they're ready to be a client."
          className="mb-16"
        />

        <motion.ol
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-6 md:grid-cols-3"
        >
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              data-testid="step"
              variants={revealItem}
              className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-7"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <step.icon className="h-5 w-5" aria-hidden />
                </span>
                <span
                  aria-hidden
                  className="font-display text-5xl text-primary/25 leading-none"
                >
                  {index + 1}
                </span>
              </div>
              <Typography
                variant="h3"
                className="font-semibold text-card-foreground text-xl"
              >
                {step.title}
              </Typography>
              <Typography variant="muted" className="text-base leading-relaxed">
                {step.body}
              </Typography>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
