import { Reveal } from "@/components/landing/reveal";
import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

/** Eyebrow, serif headline and lead — the opening of every landing section. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}): React.ReactNode {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start",
        className,
      )}
    >
      <Typography
        variant="small"
        className="font-semibold text-primary uppercase tracking-widest"
      >
        {eyebrow}
      </Typography>
      <Typography
        variant="h2"
        className="max-w-3xl border-none pb-0 font-display font-normal text-4xl tracking-normal sm:text-5xl"
      >
        {title}
      </Typography>
      {lead ? (
        <Typography variant="lead" className="max-w-2xl text-lg sm:text-xl">
          {lead}
        </Typography>
      ) : null}
    </Reveal>
  );
}
