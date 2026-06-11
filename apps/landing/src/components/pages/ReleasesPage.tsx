import { Trans } from "@lingui/react/macro";
import { ArrowLeft, ArrowUpRight, Github } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { ReleaseMarkdown } from "@/components/ReleaseMarkdown";
import { cn } from "@/lib/cn";
import {
  sectionTone,
  summarizeSections,
  type SectionTone,
} from "@/lib/releaseSummary";
import {
  formatAbsoluteDate,
  formatRelativeDate,
  useStableReleases,
  type GithubRelease,
} from "@/lib/useGithubReleases";

function anchorIdForTag(tag: string): string {
  return `release-${tag.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function ReleasesPage({ focusTag }: { focusTag?: string }) {
  const { releases, loading, error } = useStableReleases();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const items = useMemo(() => releases ?? [], [releases]);

  /** After items render, scroll the focused tag into view. */
  useEffect(() => {
    if (!focusTag || items.length === 0) return;
    const el = document.getElementById(anchorIdForTag(focusTag));
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [focusTag, items]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[color:var(--color-background)] pb-24 pt-28 lg:pb-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [background:radial-gradient(ellipse_55%_55%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 md:px-8">
        <div
          className={cn(
            "flex items-center gap-2 transition-all duration-500",
            mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <a
            href="#top"
            className="group inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)]/70 px-3 py-1 text-xs font-semibold text-[color:var(--color-muted-foreground)] shadow-sm backdrop-blur-sm transition-all hover:border-[color:var(--color-primary)]/30 hover:text-[color:var(--color-foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <Trans>Back to home</Trans>
          </a>
        </div>

        <header className="mt-8 flex flex-col gap-3">
          <div
            className={cn(
              "text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)] transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "80ms" }}
          >
            <Trans>Changelog</Trans>
          </div>
          <h1
            className={cn(
              "text-balance text-3xl font-bold leading-[1.1] tracking-tight transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:text-[44px]",
              mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
            style={{ transitionDelay: "140ms" }}
          >
            <Trans>Every ship of ADT Studio.</Trans>
          </h1>
          <p
            className={cn(
              "max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] transition-opacity duration-[600ms] md:text-lg",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "240ms" }}
          >
            <Trans>
              Newest first, with the full notes inline — what changed, why it
              matters, and the screenshots to back it up.
            </Trans>
          </p>
        </header>

        <div className="mt-12">
          {loading && items.length === 0 ? (
            <ChangelogSkeleton mounted={mounted} />
          ) : error && items.length === 0 ? (
            <ErrorCard />
          ) : items.length === 0 ? (
            <EmptyCard />
          ) : (
            <ol className="relative flex flex-col gap-20">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-2 left-[170px] hidden w-px bg-[color:var(--color-border)] md:block"
              />
              {items.map((release, i) => (
                <ReleaseEntry
                  key={release.tag_name}
                  release={release}
                  isLatest={i === 0}
                  mounted={mounted}
                  delayMs={Math.min(i, 6) * 80}
                />
              ))}
            </ol>
          )}

          <div
            className={cn(
              "mt-20 flex flex-wrap items-center justify-center gap-2 border-t border-[color:var(--color-border)] pt-8 transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "560ms" }}
          >
            <Button
              href="https://github.com/unicef/adt-studio/releases"
              target="_blank"
              rel="noreferrer noopener"
              variant="secondary"
              size="md"
            >
              <Trans>See all releases on GitHub</Trans>
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseEntry({
  release,
  isLatest,
  mounted,
  delayMs,
}: {
  release: GithubRelease;
  isLatest: boolean;
  mounted: boolean;
  delayMs: number;
}) {
  const title = release.name?.trim() || release.tag_name;
  const sections = summarizeSections(release.body).slice(0, 5);
  return (
    <li
      id={anchorIdForTag(release.tag_name)}
      data-tag={release.tag_name}
      className={cn(
        "scroll-mt-28 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:grid md:grid-cols-[150px_minmax(0,1fr)] md:gap-x-12",
        mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
      style={{ transitionDelay: `${300 + delayMs}ms` }}
    >
      <aside className="relative md:py-1 md:text-right">
        {/* Dot sits on the timeline at this entry's start. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-[170px] top-[5px] hidden h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-[color:var(--color-background)] md:block",
            isLatest
              ? "bg-[color:var(--color-primary)]"
              : "bg-[color:var(--color-foreground)]",
          )}
        />
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-muted-foreground)]">
          {formatAbsoluteDate(release.published_at)}
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-2 py-0.5 font-mono text-[12px] font-bold text-[color:var(--color-foreground)] shadow-sm">
          {release.tag_name}
        </div>
      </aside>

      <div className="mt-5 min-w-0 md:mt-0">
        <h2 className="text-balance text-[22px] font-semibold leading-tight tracking-tight text-[color:var(--color-foreground)] md:text-[26px]">
          {title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isLatest && (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              <Trans>Latest</Trans>
            </span>
          )}
          <span className="font-mono text-[10px] text-[color:var(--color-muted-foreground)]/80">
            {formatRelativeDate(release.published_at)}
          </span>
        </div>

        {sections.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {sections.map((s) => (
              <CategoryChip
                key={s.title}
                label={s.title}
                count={s.count}
                tone={sectionTone(s.title)}
              />
            ))}
          </div>
        )}

        <div className={cn(sections.length > 0 ? "mt-5" : "mt-3")}>
          {release.body && release.body.trim() ? (
            <ReleaseMarkdown
              source={release.body}
              channel={release.prerelease ? "beta" : "stable"}
            />
          ) : (
            <p className="text-sm text-[color:var(--color-muted-foreground)]">
              <Trans>No release notes were provided for this version.</Trans>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function CategoryChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: SectionTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        chipStyles[tone],
      )}
    >
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-white/60 px-1 font-mono text-[10px] font-bold tabular-nums">
          {count}
        </span>
      )}
    </span>
  );
}

const chipStyles: Record<SectionTone, string> = {
  added: "border-emerald-200 bg-emerald-50 text-emerald-800",
  fixed: "border-blue-200 bg-blue-50 text-blue-800",
  perf: "border-violet-200 bg-violet-50 text-violet-800",
  changed: "border-amber-200 bg-amber-50 text-amber-800",
  breaking: "border-rose-200 bg-rose-50 text-rose-800",
  security: "border-red-200 bg-red-50 text-red-800",
  docs: "border-slate-200 bg-slate-50 text-slate-700",
  neutral:
    "border-[color:var(--color-border)] bg-[color:var(--color-muted)]/60 text-[color:var(--color-muted-foreground)]",
};

function ChangelogSkeleton({ mounted }: { mounted: boolean }) {
  return (
    <div aria-busy className="relative flex flex-col gap-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-2 left-[170px] hidden w-px bg-[color:var(--color-border)] md:block"
      />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "transition-opacity duration-500 md:grid md:grid-cols-[150px_minmax(0,1fr)] md:gap-x-12",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: `${300 + i * 80}ms` }}
        >
          <div className="relative flex flex-col items-end gap-2">
            <span className="absolute left-[170px] top-[5px] hidden h-3 w-3 -translate-x-1/2 rounded-full bg-[color:var(--color-muted)] ring-4 ring-[color:var(--color-background)] md:block" />
            <span className="h-3 w-28 rounded bg-[color:var(--color-muted)]" />
            <span className="h-5 w-16 rounded-md bg-[color:var(--color-muted)]" />
          </div>
          <div className="mt-5 md:mt-0">
            <span className="block h-5 w-3/4 rounded bg-[color:var(--color-muted)]" />
            <div className="mt-5 flex gap-2">
              <span className="h-5 w-16 rounded-full bg-[color:var(--color-muted)]" />
              <span className="h-5 w-16 rounded-full bg-[color:var(--color-muted)]" />
              <span className="h-5 w-20 rounded-full bg-[color:var(--color-muted)]" />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <span className="h-3 w-[96%] rounded bg-[color:var(--color-muted)]" />
              <span className="h-3 w-[92%] rounded bg-[color:var(--color-muted)]" />
              <span className="h-3 w-[80%] rounded bg-[color:var(--color-muted)]" />
              <span className="h-3 w-[72%] rounded bg-[color:var(--color-muted)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6">
      <div className="text-base font-semibold text-[color:var(--color-foreground)]">
        <Trans>Couldn&rsquo;t load the changelog</Trans>
      </div>
      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
        <Trans>
          We couldn&rsquo;t reach GitHub. The full list is always available on
          the upstream repo.
        </Trans>
      </p>
      <div className="mt-4">
        <Button
          href="https://github.com/unicef/adt-studio/releases"
          target="_blank"
          rel="noreferrer noopener"
          variant="secondary"
          size="md"
        >
          <Github className="h-4 w-4" />
          <Trans>Open on GitHub</Trans>
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/60 p-6 text-sm text-[color:var(--color-muted-foreground)]">
      <Trans>
        No releases published yet — check back once the first build ships.
      </Trans>
    </div>
  );
}
