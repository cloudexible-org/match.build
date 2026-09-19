"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { revealGroup, revealItem } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { Typography } from "@/components/ui/typography";

const GUARANTEES = [
  "Every record belongs to one matchmaker. No other account can see it, and none of our tools look across accounts.",
  "If someone is a candidate of two matchmakers, they get two separate records. Neither of you can find out about the other.",
  "Candidates only see their chat with you. Never your notes, the DM history you pasted in, the change history or other candidates.",
  "Nothing is deleted. If a candidate leaves or closes their account, you keep the conversation and your notes. They're told this before they accept your invitation.",
] as const;

export function Privacy(): React.ReactNode {
  return (
    <section
      id="privacy"
      data-testid="privacy"
      className="w-full px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <SectionHeading
          align="start"
          eyebrow="Privacy"
          title="Your candidates are yours alone."
          lead="Candidates tell you personal things. That information stays inside your account and is never pooled or shared."
        />

        <motion.ul
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col gap-4"
        >
          {GUARANTEES.map((line) => (
            <motion.li
              key={line}
              variants={revealItem}
              className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Lock className="h-4 w-4" aria-hidden />
              </span>
              <Typography
                as="span"
                variant="muted"
                className="text-[15px] text-card-foreground leading-relaxed"
              >
                {line}
              </Typography>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
