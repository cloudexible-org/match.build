import type { ReactNode } from "react";

/** A centred status line for loading and transitional states. */
export function FullPageStatus({ children }: { children: ReactNode }) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-4 text-sm text-muted-foreground"
      aria-live="polite"
    >
      {children}
    </main>
  );
}
