"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

const QUESTIONS = [
  {
    q: "Is this a dating app?",
    a: "No. Your candidates never browse or swipe through anyone. Matchmaker is the tool you use to run your business, and the matching is still done by you.",
  },
  {
    q: "Do my candidates need to download anything?",
    a: "No. They open your invitation, sign up with their name and email, and chat with you in the browser. They can add it to their home screen if they'd like notifications on their phone.",
  },
  {
    q: "Do conversations happen over email?",
    a: "No. Email is only used for sign-in codes, invitations and a short note that a new message is waiting. That note never includes the message itself, and every reply happens in the chat.",
  },
  {
    q: "What about Instagram and WhatsApp?",
    a: "Carry on meeting people there. When someone's ready, onboard them with their email and paste in your DM history. We email them an invitation, or you can send the invite link in the DM. We don't connect to either app directly.",
  },
  {
    q: "Where does AI come in?",
    a: "Next. The first version is a complete inbox with no AI in it. Suggested replies in your voice and a profile that builds itself as candidates talk come after that. Even then, nothing is sent until you choose to send it.",
  },
  {
    q: "What does it cost?",
    a: "We're starting with a small group of matchmakers and working closely with them. Pricing comes later, and people on the waitlist will hear first.",
  },
  {
    q: "What's coming next?",
    a: "AI help inside the conversation first. After that, a match board for the other half of the job: suggested pairs with the reasons behind them, the introduction, both candidates' answers, and how it went.",
  },
] as const;

export function Faq(): React.ReactNode {
  return (
    <section
      id="faq"
      data-testid="faq"
      className="w-full border-border/60 border-t bg-muted/40 px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <SectionHeading
          eyebrow="Questions"
          title="Before you ask"
          className="mb-12"
        />

        <Reveal>
          <Accordion.Root className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {QUESTIONS.map((item) => (
              <Accordion.Item key={item.q} data-testid="faq-item">
                <Accordion.Header className="m-0">
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 px-6 py-5 text-left font-medium text-base text-card-foreground outline-none transition-colors hover:text-primary focus-visible:bg-secondary">
                    {item.q}
                    <Plus
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-45"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
                  <p className="px-6 pb-5 text-muted-foreground leading-relaxed">
                    {item.a}
                  </p>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Reveal>
      </div>
    </section>
  );
}
