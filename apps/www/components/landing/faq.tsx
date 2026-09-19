"use client";

import { Accordion } from "@base-ui/react/accordion";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

const QUESTIONS = [
  {
    q: "Is this a dating app?",
    a: "No. Your clients never browse or swipe through anyone. Matchmaker is the tool you use to run your business, and the matching is still done by you.",
  },
  {
    q: "Do my clients need to download anything?",
    a: "No. They can reply to your emails like any other email, or open a simple chat from a link in the first one. Both end up in the same thread on your side.",
  },
  {
    q: "Does the AI ever message clients on its own?",
    a: "Never. It suggests replies and drafts the first email, and you send each one yourself. If the AI is unavailable, you can still read and reply as normal.",
  },
  {
    q: "Why do I need my own email domain?",
    a: "Email from your own domain looks like it's from you, and it's less likely to land in spam. Setup means adding a few DNS records. We show you exactly what to add, or we can do it for you.",
  },
  {
    q: "What about Instagram and WhatsApp?",
    a: "Carry on meeting people there. When a client is ready, paste the conversation in and Matchmaker takes it from there. We don't connect to either app directly yet.",
  },
  {
    q: "What does it cost?",
    a: "We're starting with a small group of matchmakers and working closely with them. Pricing comes later, and people on the waitlist will hear first.",
  },
  {
    q: "What's coming next?",
    a: "A match board for the other half of the job: suggested pairs with the reasons behind them, the introduction, both clients' answers, and how it went. It learns from the matches you reject as well as the ones you make.",
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
