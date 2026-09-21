import { BrandMark } from "@/components/landing/brand-mark";
import { NewTabHint } from "@/components/ui/new-tab-hint";
import { Typography } from "@/components/ui/typography";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
  { href: "/app/", label: "Sign in" },
] as const;

export function SiteFooter(): React.ReactNode {
  return (
    <footer className="w-full border-border/60 border-t px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2 text-foreground">
          <BrandMark className="h-4 w-4 text-primary" />
          <span className="font-display text-xl leading-none">match.build</span>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Typography variant="muted">
          Built by{" "}
          <a
            href="https://cloudexible.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            Cloudexible
            <NewTabHint />
          </a>
        </Typography>
      </div>
    </footer>
  );
}
