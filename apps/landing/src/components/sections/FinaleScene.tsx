import { ArrowRight, Github } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/Button";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { trackEvent } from "@/lib/matomo";
import { STAGES, type Stage } from "@/data/stages";
import { cn } from "@/lib/cn";
import { useInView } from "@/lib/useScrollProgress";

export function FinaleScene() {
  const { t } = useLingui();
  const { ref, inView: mounted } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <section
      id="finale"
      className="snap-section relative flex min-h-screen items-center overflow-hidden bg-[color:var(--color-background)] py-24 lg:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(ellipse_at_50%_100%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.02] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <div
        ref={ref}
        className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-6 text-center"
      >
        <div className="flex flex-col items-center gap-5">
          <SectionEyebrow
            label={t`Get started`}
            className={cn(
              "transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0",
            )}
          />
          <h2
            className={cn(
              "max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-[color:var(--color-foreground)] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-5xl md:text-[72px]",
              mounted
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0",
            )}
            style={{ transitionDelay: "120ms" }}
          >
            <Trans>
              Your first accessible book{" "}
              <span className="bg-gradient-to-r from-[color:var(--color-primary)] to-violet-500 bg-clip-text text-transparent">
                starts here.
              </span>
            </Trans>
          </h2>
          <p
            className={cn(
              "mx-auto max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] transition-opacity duration-[600ms] md:text-lg",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "280ms" }}
          >
            <Trans>
              Drop in a PDF and watch it flow through every stage — from raw
              pages to an accessible reader. Free, open-source, runs on your
              machine.
            </Trans>
          </p>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-3 transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "420ms" }}
        >
          <Button
            href="#/download"
            size="lg"
            variant="primary"
            onClick={() => trackEvent("cta", "download_click", "finale")}
          >
            <Trans>Download ADT Studio</Trans>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            href="https://github.com/unicef/adt-studio"
            target="_blank"
            rel="noreferrer noopener"
            size="lg"
            variant="secondary"
            onClick={() => trackEvent("outbound", "github_source", "finale")}
          >
            <Github className="h-4 w-4" />
            <Trans>View source</Trans>
          </Button>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 text-xs text-[color:var(--color-muted-foreground)] transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "540ms" }}
        >
          <span className="font-mono">
            <Trans>Free forever</Trans>
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--color-border)]" />
          <span className="font-mono">
            <Trans>No account needed</Trans>
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--color-border)]" />
          <span className="font-mono">
            <Trans>MIT licensed</Trans>
          </span>
        </div>

        <div className="mt-6 w-full">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
            <Trans>What happens when you drop in a PDF</Trans>
          </div>
          <StageTimeline mounted={mounted} />
        </div>
      </div>
    </section>
  );
}

function StageTimeline({ mounted }: { mounted: boolean }) {
  const { t } = useLingui();
  return (
    <ol
      aria-label={t`Book creation stages`}
      className="relative flex w-full items-start justify-between"
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[15px] right-[15px] top-[15px] h-px origin-left bg-[color:var(--color-border)] transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-x-100" : "scale-x-0",
        )}
        style={{ transitionDelay: "700ms" }}
      />
      {STAGES.map((stage, i) => (
        <StageNode key={stage.slug} stage={stage} index={i} mounted={mounted} />
      ))}
    </ol>
  );
}

function StageNode({
  stage,
  index,
  mounted,
}: {
  stage: Stage;
  index: number;
  mounted: boolean;
}) {
  const { i18n } = useLingui();
  const Icon = stage.icon;
  return (
    <li className="relative flex flex-col items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full border-[1.5px] bg-[color:var(--color-background)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        style={{
          transitionDelay: `${800 + index * 60}ms`,
          borderColor: stage.hex,
          color: stage.hex,
        }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
      <span
        className={cn(
          "hidden whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-muted-foreground)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:inline-block",
          mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
        style={{ transitionDelay: `${900 + index * 60}ms` }}
      >
        {i18n._(stage.label)}
      </span>
    </li>
  );
}
