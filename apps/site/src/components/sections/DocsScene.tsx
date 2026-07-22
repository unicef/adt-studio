import { ArrowRight, FileDown, LifeBuoy, Rocket, Workflow } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { LucideIcon } from "lucide-react";
import { SearchTrigger } from "@/components/SearchTrigger";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/href";
import { trackEvent } from "@/lib/matomo";
import { useInView } from "@/lib/useScrollProgress";

type Category = {
  href: string;
  icon: LucideIcon;
  title: MessageDescriptor;
  desc: MessageDescriptor;
};

const CATEGORIES: Category[] = [
  {
    href: "/docs/get-started",
    icon: Rocket,
    title: msg`Get Started`,
    desc: msg`What to know and set up before converting your first PDF.`,
  },
  {
    href: "/docs/convert-pdf",
    icon: Workflow,
    title: msg`Convert a PDF into an ADT`,
    desc: msg`Import, extract, section, storyboard, and validate.`,
  },
  {
    href: "/docs/export",
    icon: FileDown,
    title: msg`Export your ADT`,
    desc: msg`Package your finished ADT for distribution.`,
  },
  {
    href: "/docs/faq",
    icon: LifeBuoy,
    title: msg`Troubleshooting & FAQ`,
    desc: msg`Answers to common questions and issues.`,
  },
];

export function DocsScene() {
  const { t, i18n } = useLingui();
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <section
      id="docs"
      aria-label={t`Documentation`}
      className="snap-section relative flex min-h-screen items-center justify-center overflow-hidden border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 py-24 lg:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent_55%)]"
      />

      <div
        ref={ref}
        className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-6 text-center"
      >
        <SectionEyebrow
          label={t`Documentation`}
          className={cn(
            "transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
        />

        <h2
          className={cn(
            "text-balance text-4xl font-semibold leading-[1.05] tracking-tight transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-5xl md:text-[56px]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
          style={{ transitionDelay: "100ms" }}
        >
          <Trans>
            Need help?{" "}
            <span className="bg-gradient-to-r from-[color:var(--color-primary)] to-violet-500 bg-clip-text text-transparent">
              We got you.
            </span>
          </Trans>
        </h2>

        <p
          className={cn(
            "max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] transition-opacity duration-[600ms] md:text-lg",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "240ms" }}
        >
          <Trans>
            The documentation walks you through ADT Studio end to end — from
            installing the app to mastering every step of building an accessible
            book.
          </Trans>
        </p>

        <div
          className={cn(
            "w-full max-w-xl transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
          style={{ transitionDelay: "360ms" }}
        >
          <SearchTrigger
            source="docs_section"
            className="h-14 w-full rounded-2xl"
          />
        </div>

        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <a
                key={c.href}
                href={withBase(c.href)}
                onClick={() => trackEvent("nav", "docs_click", c.href)}
                className={cn(
                  "group flex flex-col items-center gap-2.5 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 text-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-[color:var(--color-primary)]/40 hover:shadow-[0_18px_40px_-24px_color-mix(in_oklch,var(--color-primary)_50%,transparent)]",
                  mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
                )}
                style={{ transitionDelay: `${440 + i * 80}ms` }}
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-primary)] transition-colors duration-300 group-hover:border-[color:var(--color-primary)]/40">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-semibold text-[color:var(--color-foreground)]">
                  {i18n._(c.title)}
                </span>
                <span className="text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                  {i18n._(c.desc)}
                </span>
              </a>
            );
          })}
        </div>

        <a
          href={withBase("/docs")}
          onClick={() => trackEvent("nav", "docs_click", "docs_browse_all")}
          className={cn(
            "group inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--color-primary)] transition-all duration-500 hover:text-[color:var(--color-foreground)]",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "800ms" }}
        >
          <Trans>Browse all documentation</Trans>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}
