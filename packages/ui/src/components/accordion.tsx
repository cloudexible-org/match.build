import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Sections that expand and collapse, on Base UI (keyboard, ARIA and the
 * open/closed state included). Several can be open at once.
 *
 *   <Accordion defaultValue={["details"]}>
 *     <AccordionSection value="details" title="Details">…</AccordionSection>
 *   </Accordion>
 *
 * The open item carries `data-open`, which the chevron rotates on.
 */

export function Accordion({
  className,
  ...props
}: React.ComponentProps<typeof BaseAccordion.Root>) {
  return (
    <BaseAccordion.Root
      className={cn("flex flex-col divide-y divide-border", className)}
      {...props}
    />
  );
}

export function AccordionSection({
  value,
  title,
  children,
  className,
}: {
  value: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseAccordion.Item value={value} className={cn("group", className)}>
      <BaseAccordion.Header>
        <BaseAccordion.Trigger
          data-testid={`accordion-${value}`}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {title}
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180"
          >
            <path
              d="M2 4.5 6 8.5 10 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
      <BaseAccordion.Panel className="px-4 pb-4">
        {children}
      </BaseAccordion.Panel>
    </BaseAccordion.Item>
  );
}
