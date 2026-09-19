import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type * as React from "react";
import { cn } from "../lib/cn";

/**
 * Tabs on Base UI, which handles roving focus and the ARIA wiring. The
 * selected tab carries `data-active` (not `data-selected`), which is what the
 * underline styles key off.
 *
 *   <Tabs defaultValue="details">
 *     <TabsList>
 *       <TabsTab value="details">Details</TabsTab>
 *     </TabsList>
 *     <TabsPanel value="details">…</TabsPanel>
 *   </Tabs>
 */

export function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Root>) {
  return (
    <BaseTabs.Root className={cn("flex flex-col", className)} {...props} />
  );
}

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      className={cn(
        "flex shrink-0 gap-1 border-b border-border px-2",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTab({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active]:border-primary data-[active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: React.ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}
