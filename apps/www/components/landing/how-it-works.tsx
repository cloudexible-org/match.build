"use client";

import { ClipboardPaste, LayoutGrid, MessagesSquare, Send } from "lucide-react";
import { motion } from "motion/react";
import { revealGroup, revealItem } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { Typography } from "@/components/ui/typography";

const STEPS = [
  {
    icon: ClipboardPaste,
    title: "Onboard them from the DM",
    body: "When a conversation on Instagram or WhatsApp turns serious, click Onboard and add their email. Their name, handles and the DM so far are optional. The pasted history is only ever visible to you.",
  },
  {
    icon: Send,
    title: "They get an invitation",
    body: "We email them an invitation from invites@match.build with your name on it. Or copy the invite link and drop it straight into the DM. Meanwhile you can read the history and add notes.",
  },
  {
    icon: MessagesSquare,
    title: "Carry on in the chat",
    body: "They sign up with their name and email, accept, and the conversation carries on in a private chat with you. Drafts in your voice wait above the composer, and what you learn goes on their profile.",
  },
  {
    icon: LayoutGrid,
    title: "Work the match board",
    body: "Every night your book is scored pair by pair, and the strongest land on the board as suggestions with the arithmetic on the card. You introduce, you record how it went.",
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
          title="From a DM to an introduction"
          lead="Keep meeting people where you already do. When someone's ready to work with you, invite them in — and the other half of the job, finding who to put them in front of, happens in the same place."
          className="mb-16"
        />

        <motion.ol
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
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
