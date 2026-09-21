"use client";

import { Check, EyeOff } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { EASE_OUT } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

/**
 * A still of the product's centre column: one candidate's conversation, opening
 * with the DM history the matchmaker pasted in at onboarding (private to them),
 * then the accepted invitation and the chat carrying on. The candidate panel's
 * History tab sits beside it.
 *
 * It is an illustration, not UI — nothing in it is interactive, so it is
 * hidden from assistive technology and described once by the figcaption.
 */

const mockGroup: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.35, delayChildren: 0.6 } },
};

const mockItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

export function ConversationMock(): React.ReactNode {
  return (
    <figure data-testid="conversation-mock" className="relative w-full">
      <figcaption className="sr-only">
        An example conversation in match.build: the Instagram DM history the
        matchmaker pasted in when onboarding a candidate, marked as visible only
        to the matchmaker, then the candidate accepting the invitation and the
        chat carrying on in the app, with the candidate's history of changes
        beside it.
      </figcaption>

      <motion.div
        aria-hidden
        variants={mockGroup}
        initial="hidden"
        animate="visible"
        className="relative"
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-primary/5 shadow-xl">
          {/* Conversation header */}
          <div className="flex items-center gap-3 border-border/70 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display text-accent-foreground text-lg">
              P
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-card-foreground text-sm">
                Priya S.
              </p>
              <p className="truncate text-muted-foreground text-xs">
                Joined 5 May · @priya.reads on Instagram
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground">
              Notes · 2
            </span>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            {/* Imported DM history: a private message, never styled as chat. */}
            <motion.div
              variants={mockItem}
              className="rounded-xl border border-border border-dashed bg-muted/60 p-3"
            >
              <p className="mb-2 flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                <EyeOff className="h-3.5 w-3.5" />
                Only visible to you · Imported from Instagram
              </p>
              <div className="flex flex-col gap-1 text-muted-foreground text-xs leading-relaxed">
                <p>
                  <span className="font-medium text-foreground">Priya:</span> A
                  friend sent me your page. I'm so done with the apps.
                </p>
                <p>
                  <span className="font-medium text-foreground">You:</span>{" "}
                  Let's do this properly. What's your email?
                </p>
              </div>
            </motion.div>

            {/* Membership change: a system line, never styled as a message. */}
            <motion.div
              variants={mockItem}
              className="flex items-center justify-center gap-2 text-muted-foreground text-xs"
            >
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>
                <span className="text-foreground">Priya</span> accepted your
                invitation · 5 May
              </span>
            </motion.div>

            <Bubble side="out">
              Priya, so glad Maya sent you my way. Tell me what "done with the
              apps" looks like for you?
            </Bubble>

            <Bubble side="in">
              Honestly? Someone who reads more than he scrolls. And I'm 5'9", so
              taller, ideally.
            </Bubble>

            <Bubble side="out">A reader! Fiction or non-fiction?</Bubble>

            {/* Composer */}
            <motion.div
              variants={mockItem}
              className="mt-1 flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pr-1.5 pl-4"
            >
              <span className="flex-1 truncate text-muted-foreground text-xs">
                Write a message…
              </span>
              <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs">
                Send
              </span>
            </motion.div>
          </div>
        </div>

        {/* Candidate panel, History tab: hangs off the lower left on wide
            screens, over the composer's placeholder and clear of the messages. */}
        <motion.div
          variants={mockItem}
          className="-left-12 -bottom-32 absolute hidden w-52 rounded-xl border border-border bg-card p-4 text-left shadow-lg xl:block"
        >
          <p className="mb-3 flex gap-3 text-[11px] uppercase tracking-wider">
            <span className="text-muted-foreground">Details</span>
            <span className="text-muted-foreground">Notes</span>
            <span className="font-medium text-card-foreground">History</span>
          </p>
          <ul className="flex flex-col gap-2 text-xs">
            <HistoryEntry when="Just now" text="You added a note" isNew />
            <HistoryEntry when="5 May" text="Priya joined" />
            <HistoryEntry when="3 May" text="You sent an invitation" />
          </ul>
        </motion.div>
      </motion.div>
    </figure>
  );
}

function Bubble({
  side,
  children,
}: {
  side: "in" | "out";
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <motion.div
      variants={mockItem}
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed",
        side === "out"
          ? "self-end rounded-br-sm bg-primary text-primary-foreground"
          : "self-start rounded-bl-sm bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </motion.div>
  );
}

function HistoryEntry({
  when,
  text,
  isNew = false,
}: {
  when: string;
  text: string;
  isNew?: boolean;
}): React.ReactNode {
  return (
    <li
      className={cn(
        "rounded-lg px-2.5 py-2",
        isNew ? "bg-accent text-accent-foreground" : "bg-secondary/60",
      )}
    >
      <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">
        {when}
      </span>
      {text}
    </li>
  );
}
