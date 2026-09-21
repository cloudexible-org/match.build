import { AnalyticsProvider } from "@repo/analytics";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { MotionProvider } from "@/components/motion-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/env";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "lenis/dist/lenis.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const DESCRIPTION =
  "One workspace for independent matchmakers: bring candidates over from your DMs with an invitation, run every relationship in one private chat with drafts in your voice, and work a match board that scores your whole book every night and shows its reasons.";

export const metadata: Metadata = {
  title: "match.build — the matchmaker's operating system",
  description: DESCRIPTION,
  openGraph: {
    title: "match.build — the matchmaker's operating system",
    description: DESCRIPTION,
    type: "website",
    siteName: "match.build",
  },
  twitter: { card: "summary", title: "match.build", description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    // Font variables go on <html>, not <body>: the `@theme` tokens that
    // reference them (`--font-display` etc.) are declared on `:root`, and a
    // custom property resolves `var()` where it is declared — so a variable
    // defined only on <body> is invisible to them.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AnalyticsProvider
            apiKey={env.NEXT_PUBLIC_POSTHOG_KEY}
            apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
          >
            <ConvexClientProvider>
              <MotionProvider>{children}</MotionProvider>
            </ConvexClientProvider>
          </AnalyticsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
