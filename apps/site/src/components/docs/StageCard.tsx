import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { DOCS_COLORS } from "@/data/docs-colors";

/** Grid wrapper for `StageCard` — same layout as the Overview's `WhereToBegin`. */
export function StageCards({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

/**
 * A colored card matching the Overview page's `WhereToBegin` look — same
 * chip-style icon, same hover treatment. `slug` is a key into `DOCS_COLORS`
 * (icon + color only); `href`, if given, is the docs path to link to (e.g.
 * "convert-pdf/extract"). Omit `href` for a non-interactive card (e.g. the
 * export format options, which aren't separate pages).
 */
export function StageCard({
  slug,
  href,
  title,
  description,
}: {
  slug: string;
  href?: string;
  title: string;
  description: string;
}) {
  const entry = DOCS_COLORS[slug];
  const Icon = entry?.icon;
  const color = entry?.hex ?? "#64748b";

  const inner = (
    <>
      {Icon ? (
        <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--c)_13%,transparent)] text-[var(--c)] transition-colors group-hover:bg-[color-mix(in_oklab,var(--c)_20%,transparent)]">
          <Icon className="size-[1.15rem]" />
        </span>
      ) : null}
      <span className="font-semibold text-fd-foreground">{title}</span>
      <span className="text-sm leading-relaxed text-fd-muted-foreground">{description}</span>
    </>
  );

  const style = { "--c": color } as CSSProperties;

  if (!href) {
    return (
      <div style={style} className="flex flex-col gap-2 rounded-xl border border-fd-border bg-[var(--fd-content-surface)] p-4">
        {inner}
      </div>
    );
  }

  return (
    <Link
      to="/docs/$"
      params={{ _splat: href }}
      style={style}
      className="group flex flex-col gap-2 rounded-xl border border-fd-border bg-[var(--fd-content-surface)] p-4 no-underline shadow-sm transition-all hover:border-[color-mix(in_oklab,var(--c)_45%,transparent)] hover:shadow-md"
    >
      {inner}
    </Link>
  );
}
