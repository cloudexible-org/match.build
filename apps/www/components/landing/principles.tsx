"use client";

import { motion } from "motion/react";
import { Reveal, revealGroup, revealItem } from "@/components/landing/reveal";
import { Typography } from "@/components/ui/typography";

const PRINCIPLES = [
  {
    title: "Nothing sends without you",
    body: "Every message a candidate reads is one you chose to send. When AI suggestions arrive, they'll wait for your approval too.",
  },
  {
    title: "Private means private",
    body: "The DM history you paste in and your notes are marked as yours alone. Candidates see the chat and nothing else.",
  },
  {
    title: "Every change is on the record",
    body: "Edited details, invitations, notes, who joined and who left: each is logged with who did it and when. Removing something never erases it.",
  },
  {
    title: "It works without the AI",
    body: "The first version is a complete inbox and candidate list with no AI in it. AI help comes next, and if it ever fails you keep working.",
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
            We organise. <em>You decide.</em>
          </Typography>
          <Typography variant="lead" className="text-background/70 text-lg">
            We're not building a dating app, and we're not trying to replace
            your judgement with an algorithm. Your judgement is what candidates
            pay for.
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
