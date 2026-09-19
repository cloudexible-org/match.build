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
  "One workspace for independent matchmakers: every client conversation in one thread, a profile that builds itself as they talk, and replies drafted in your voice for you to approve.";

export const metadata: Metadata = {
  title: "Matchmaker — the matchmaker's operating system",
  description: DESCRIPTION,
  openGraph: {
    title: "Matchmaker — the matchmaker's operating system",
    description: DESCRIPTION,
    type: "website",
    siteName: "Matchmaker",
  },
  twitter: { card: "summary", title: "Matchmaker", description: DESCRIPTION },
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
