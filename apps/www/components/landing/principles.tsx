"use client";

import { motion } from "motion/react";
import { Reveal, revealGroup, revealItem } from "@/components/landing/reveal";
import { Typography } from "@/components/ui/typography";

const PRINCIPLES = [
  {
    title: "Nothing sends without you",
    body: "Every draft, including the very first email, waits for your approval.",
  },
  {
    title: "Suggestions never look like messages",
    body: "AI cards are dashed, tinted and labelled, so you'll never mistake one for something a client said.",
  },
  {
    title: "You can always see where a fact came from",
    body: "Open any fact to see the message it came from. Anything added automatically can be undone.",
  },
  {
    title: "It still works if the AI doesn't",
    body: "If a suggestion fails, you still have a normal inbox and client list. The AI never stops you working.",
  },
] as const;

export function Principles(): React.ReactNode {
  return (
    <section
      data-testid="principles"
      className="w-full bg-foreground px-4 py-24 text-background sm:px-6 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <Reveal className="flex flex-col gap-5">
          <Typography
            variant="small"
            className="font-semibold text-background/60 uppercase tracking-widest"
          >
            Our rule
          </Typography>
          <Typography
            variant="h2"
            className="border-none pb-0 font-display font-normal text-5xl text-background tracking-normal sm:text-6xl"
          >
            The AI drafts. <em>You decide.</em>
          </Typography>
          <Typography variant="lead" className="text-background/70 text-lg">
            We're not building a dating app, and we're not trying to replace
            your judgement with an algorithm. Your judgement is what clients pay
            for.
          </Typography>
        </Reveal>

        <motion.ul
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-x-10 gap-y-10 sm:grid-cols-2"
        >
          {PRINCIPLES.map((principle) => (
            <motion.li
              key={principle.title}
              variants={revealItem}
              className="flex flex-col gap-2 border-background/15 border-t pt-5"
            >
              <Typography
                variant="h3"
                className="font-semibold text-background text-lg"
              >
                {principle.title}
              </Typography>
              <Typography
                variant="muted"
                className="text-[15px] text-background/65 leading-relaxed"
              >
                {principle.body}
              </Typography>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
