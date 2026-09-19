"use client";

import { Check, Mail, MessageCircle, Sparkles, Undo2 } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { EASE_OUT } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

/**
 * A still of the product's centre column: one client's thread, with an
 * auto-applied fact and a suggested reply, plus the profile panel beside it.
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
        An example conversation in Matchmaker: a client says she wants someone
        taller than her who reads, the fact is added to her profile, and a reply
        is suggested in the matchmaker's voice for approval.
      </figcaption>

      <motion.div
        aria-hidden
        variants={mockGroup}
        initial="hidden"
        animate="visible"
        className="relative"
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-primary/5 shadow-xl">
          {/* Thread header */}
          <div className="flex items-center gap-3 border-border/70 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display text-accent-foreground text-lg">
              P
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-card-foreground text-sm">
                Priya S.
              </p>
              <p className="truncate text-muted-foreground text-xs">
                Active · via Instagram intake
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground">
              Profile · 7 facts
            </span>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            <motion.p
              variants={mockItem}
              className="self-center text-[11px] text-muted-foreground uppercase tracking-wider"
            >
              Imported from Instagram · 3 May
            </motion.p>

            <Bubble side="in" channel="imported">
              A friend sent me your page. I'm so done with the apps.
            </Bubble>

            <Bubble side="out" channel="email">
              Priya, so glad Maya sent you my way. Tell me what "done with the
              apps" looks like for you?
            </Bubble>

            <Bubble side="in" channel="chat">
              Honestly? Someone who reads more than he scrolls. And I'm 5'9", so
              taller, ideally.
            </Bubble>

            {/* Auto-applied fact: a system note, never styled as a message. */}
            <motion.div
              variants={mockItem}
              className="flex items-center justify-center gap-2 text-muted-foreground text-xs"
            >
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>
                Added to profile:{" "}
                <span className="text-foreground">
                  prefers partners over 5'9"
                </span>
              </span>
              <span className="inline-flex items-center gap-0.5 font-medium text-primary">
                <Undo2 className="h-3 w-3" />
                Undo
              </span>
            </motion.div>

            {/* Suggested reply: dashed, tinted, labelled. Unmistakably not a message. */}
            <motion.div
              variants={mockItem}
              className="rounded-xl border border-primary/40 border-dashed bg-accent/50 p-3"
            >
              <p className="mb-1.5 flex items-center gap-1.5 font-medium text-[11px] text-primary uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                Suggested reply · your voice
              </p>
              <p className="text-foreground leading-relaxed">
                A reader. Honestly my favourite kind of brief. Fiction or
                non-fiction? It tells me more than you'd think.
              </p>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground">
                  Send
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1">
                  Edit
                </span>
                <span className="rounded-full px-3 py-1 text-muted-foreground">
                  Dismiss
                </span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Profile panel: floats beside the thread on wide screens. */}
        <motion.div
          variants={mockItem}
          className="-right-10 -bottom-10 absolute hidden w-60 rounded-xl border border-border bg-card p-4 text-left shadow-lg xl:block"
        >
          <p className="mb-3 font-medium text-card-foreground text-xs uppercase tracking-wider">
            Profile
          </p>
          <ul className="flex flex-col gap-2 text-xs">
            <Fact label="Hard constraint" text="Wants children, eventually" />
            <Fact label="Attribute" text="Architect, lives in Hackney" />
            <Fact
              label="Preference"
              text="Prefers partners over 5'9&quot;"
              isNew
            />
          </ul>
        </motion.div>
      </motion.div>
    </figure>
  );
}

function Bubble({
  side,
  channel,
  children,
}: {
  side: "in" | "out";
  channel: "imported" | "email" | "chat";
  children: React.ReactNode;
}): React.ReactNode {
  const ChannelIcon = channel === "email" ? Mail : MessageCircle;
  return (
    <motion.div
      variants={mockItem}
      className={cn(
        "flex max-w-[85%] flex-col gap-1",
        side === "out" ? "items-end self-end" : "items-start self-start",
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2 leading-relaxed",
          side === "out"
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-secondary text-secondary-foreground",
        )}
      >
        {children}
      </div>
      {/* The only channel cue: the thread reads as one conversation. */}
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <ChannelIcon className="h-3 w-3" />
        {channel === "imported"
          ? "Instagram DM"
          : channel === "email"
            ? "Email"
            : "Chat"}
      </span>
    </motion.div>
  );
}

function Fact({
  label,
  text,
  isNew = false,
}: {
  label: string;
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
        {label}
        {isNew ? " · just now" : ""}
      </span>
      {text}
    </li>
  );
}
