import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, ArrowUpRight, Sparkles, Tag } from "lucide-react";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/href";
import {
  firstImageFromBody,
  firstParagraphFromBody,
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
import { useInView } from "@/lib/useScrollProgress";

export function ReleasesScene() {
  const { t } = useLingui();
  const { releases, loading } = useStableReleases();
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const latest = releases?.[0];

  return (
    <section
      id="releases"
      className="snap-section relative flex min-h-screen items-center border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 py-20 lg:py-24"
    >
      <div ref={ref} className="mx-auto w-full max-w-5xl px-6 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow label={t`Changelog`} />
          <h2
            className={cn(
              "mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl",
              "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            )}
            style={{ transitionDelay: "80ms" }}
          >
            <Trans>
              Fresh off the{" "}
              <span className="text-[color:var(--color-primary)]">press</span>.
            </Trans>
          </h2>
          <p
            className={cn(
              "mx-auto mt-4 max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] md:text-lg",
              "transition-opacity duration-[600ms]",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "220ms" }}
          >
            <Trans>
              Here's what shipped in the latest version — and there are plenty
              more where this came from.
            </Trans>
          </p>
        </div>

        <div
          className={cn(
            "mt-12 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
          style={{ transitionDelay: "320ms" }}
        >
          {loading && !latest ? (
            <HeroSkeleton />
          ) : latest ? (
            <HeroSpotlight release={latest} />
          ) : (
            <EmptyHero />
          )}
        </div>

        <div
          className={cn(
            "mt-8 flex flex-col items-center gap-3 transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "640ms" }}
        >
          <a
            href="https://github.com/unicef/adt-studio/releases"
            target="_blank"
            rel="noreferrer noopener"
            className="group/gh inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)]"
          >
            <Trans>Raw notes on GitHub</Trans>
            <ArrowUpRight className="h-3 w-3 transition-transform duration-200 group-hover/gh:translate-x-0.5 group-hover/gh:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function HeroSpotlight({ release }: { release: GithubRelease }) {
  const { t } = useLingui();
  const title = release.name?.trim() || release.tag_name;
  const cover = firstImageFromBody(release.body);
  const excerpt = firstParagraphFromBody(release.body, 240);
  const sections = summarizeSections(release.body).slice(0, 4);
  const detailHref = withBase(`/releases/${encodeURIComponent(release.tag_name)}`);

  return (
    <article
      className={cn(
        "group/hero relative grid grid-cols-1 gap-5 overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.22)] transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-[color:var(--color-primary)]/40 hover:shadow-[0_34px_80px_-30px_rgba(0,0,0,0.28)] md:p-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-8",
      )}
    >
      {/* Whole-card link — sits beneath the content, above the background. */}
      <a
        href={detailHref}
        aria-label={t`Read release ${release.tag_name}`}
        className="absolute inset-0 z-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
      />

      <HeroCover image={cover} tag={release.tag_name} />

      <div className="pointer-events-none relative z-[1] flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-primary)]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[color:var(--color-primary)]">
            <Tag className="h-3 w-3" />
            {release.tag_name}
          </span>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            <Trans>Latest</Trans>
          </span>
          <span aria-hidden className="opacity-50">·</span>
          <span>{formatAbsoluteDate(release.published_at)}</span>
          <span className="opacity-60">
            {" · "}
            {formatRelativeDate(release.published_at)}
          </span>
        </div>

        <h3 className="text-balance text-[26px] font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] md:text-[32px]">
          {title}
        </h3>

        {excerpt && (
          <p className="line-clamp-4 text-[15px] leading-relaxed text-[color:var(--color-muted-foreground)] md:text-base">
            {excerpt}
          </p>
        )}

        {sections.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {sections.map((s) => (
              <HeroChip
                key={s.title}
                label={s.title}
                count={s.count}
                tone={sectionTone(s.title)}
              />
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          <span className="group/cta relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[color:var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_color-mix(in_oklch,var(--color-primary)_60%,transparent)] transition-all duration-300 group-hover/hero:shadow-[0_18px_36px_-14px_color-mix(in_oklch,var(--color-primary)_70%,transparent)]">
            <Sparkles className="h-4 w-4" />
            <Trans>Read this release</Trans>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/hero:translate-x-0.5" />
          </span>
          <a
            href={release.html_url}
            target="_blank"
            rel="noreferrer noopener"
            className="group/raw pointer-events-auto relative z-[2] inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--color-muted-foreground)] transition-colors hover:text-[color:var(--color-foreground)]"
          >
            <Trans>On GitHub</Trans>
            <ArrowUpRight className="h-3 w-3 transition-transform duration-200 group-hover/raw:translate-x-0.5 group-hover/raw:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

function HeroCover({
  image,
  tag,
}: {
  image: string | null;
  tag: string;
}) {
  if (image) {
    return (
      <div className="pointer-events-none relative z-[1] aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40">
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/hero:scale-[1.02]"
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-[1] aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)]"
    >
      <div className="absolute inset-0 [background:radial-gradient(120%_120%_at_25%_15%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent_60%),radial-gradient(120%_120%_at_80%_80%,color-mix(in_oklch,#a855f7_22%,transparent),transparent_65%),linear-gradient(180deg,color-mix(in_oklch,var(--color-muted)_70%,transparent),color-mix(in_oklch,var(--color-card)_100%,transparent))]" />
      <div
        aria-hidden
        className="absolute inset-0 text-[color:var(--color-foreground)] opacity-[0.06] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:16px_16px]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-3xl font-bold tracking-tight text-[color:var(--color-foreground)]/35 md:text-4xl">
          {tag}
        </span>
      </div>
    </div>
  );
}

function HeroChip({
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

function HeroSkeleton() {
  return (
    <div
      aria-busy
      className="grid grid-cols-1 gap-5 overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 md:p-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-8"
    >
      <div className="aspect-[16/9] w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/60" />
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-2">
          <span className="h-5 w-16 rounded-md bg-[color:var(--color-muted)]" />
          <span className="h-5 w-14 rounded-md bg-[color:var(--color-muted)]" />
          <span className="h-5 w-28 rounded-md bg-[color:var(--color-muted)]" />
        </div>
        <span className="h-8 w-3/4 rounded bg-[color:var(--color-muted)]" />
        <div className="flex flex-col gap-2">
          <span className="h-3 w-[96%] rounded bg-[color:var(--color-muted)]" />
          <span className="h-3 w-[88%] rounded bg-[color:var(--color-muted)]" />
          <span className="h-3 w-[72%] rounded bg-[color:var(--color-muted)]" />
        </div>
        <div className="flex gap-2">
          <span className="h-5 w-16 rounded-full bg-[color:var(--color-muted)]" />
          <span className="h-5 w-16 rounded-full bg-[color:var(--color-muted)]" />
          <span className="h-5 w-20 rounded-full bg-[color:var(--color-muted)]" />
        </div>
        <div className="mt-1 flex gap-3">
          <span className="h-10 w-44 rounded-full bg-[color:var(--color-muted)]" />
          <span className="h-10 w-24 rounded-full bg-[color:var(--color-muted)]" />
        </div>
      </div>
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/60 p-10 text-center text-sm text-[color:var(--color-muted-foreground)]">
      <Trans>
        No releases yet — once the first build ships, it'll show up here.
      </Trans>
    </div>
  );
}
