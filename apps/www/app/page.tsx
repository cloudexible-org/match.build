import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Principles } from "@/components/landing/principles";
import { Privacy } from "@/components/landing/privacy";
import { Problem } from "@/components/landing/problem";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Waitlist } from "@/components/landing/waitlist";

export default function Home(): React.ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />

      <main className="flex flex-1 flex-col items-center">
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Principles />
        <Privacy />
        <Faq />
        <Waitlist />
      </main>

      <SiteFooter />
    </div>
  );
}
