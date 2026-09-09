import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
  tone = "light",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  align?: "center" | "left";
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "mx-auto max-w-3xl items-center text-center" : "max-w-2xl items-start text-left",
        className,
      )}
    >
      {eyebrow ? (
        <span
          className={cn(
            "inline-flex h-7 items-center rounded-full px-3 text-xs font-bold uppercase tracking-[0.12em]",
            dark ? "bg-white/10 text-white/80" : "bg-brand-tint text-brand-deep",
          )}
        >
          {eyebrow}
        </span>
      ) : null}
      <h2
        className={cn(
          "text-balance font-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.025em] sm:text-[44px] lg:text-[56px]",
          dark ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "max-w-2xl text-pretty text-[17px] leading-relaxed sm:text-lg",
            dark ? "text-white/70" : "text-ink-soft",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
