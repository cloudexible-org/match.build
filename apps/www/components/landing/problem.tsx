"use client";

import { motion } from "motion/react";
import { Reveal, revealGroup, revealItem } from "@/components/landing/reveal";
import { Typography } from "@/components/ui/typography";

const TODAY = [
  { tool: "Instagram DMs", job: "where candidates find you" },
  { tool: "WhatsApp", job: "where the real talking happens" },
  { tool: "A spreadsheet", job: "where profiles go to get stale" },
  { tool: "Your memory", job: "where everything else lives" },
] as const;

export function Problem(): React.ReactNode {
  return (
    <section
      data-testid="problem"
      className="w-full border-border/60 border-y bg-muted/40 px-4 py-24 sm:px-6 sm:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className="flex flex-col gap-5">
          <Typography
            variant="small"
            className="font-semibold text-primary uppercase tracking-widest"
          >
            The way it works today
          </Typography>
          <Typography
            variant="h2"
            className="border-none pb-0 font-display font-normal text-4xl tracking-normal sm:text-5xl"
          >
            Four apps, and none of them remember what she said in March.
          </Typography>
          <Typography variant="lead" className="text-lg">
            In March, Priya was certain she wanted children. In September she
            said she's not sure. That shift is exactly the kind of thing you get
            paid to notice, and it's buried in a chat you'll never scroll back
            to.
          </Typography>
        </Reveal>

        <motion.ul
          variants={revealGroup}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col divide-y divide-border self-center rounded-2xl border border-border bg-card"
        >
          {TODAY.map((item) => (
            <motion.li
              key={item.tool}
              variants={revealItem}
              className="flex items-baseline justify-between gap-6 px-6 py-5"
            >
              <span className="font-display text-2xl text-card-foreground">
                {item.tool}
              </span>
              <span className="text-right text-muted-foreground text-sm">
                {item.job}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
