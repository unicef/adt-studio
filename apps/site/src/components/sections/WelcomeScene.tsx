import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/Button";
import { SearchTrigger } from "@/components/SearchTrigger";
import { HeroBook } from "@/components/HeroBook";
import { TextReveal } from "@/components/motion/beui/text-reveal";
import { Magnetic } from "@/components/motion/beui/magnetic";
import { cn } from "@/lib/cn";
import { SPRING_PRESS } from "@/lib/ease";
import { DOCS_ENABLED } from "@/lib/flags";
import { withBase } from "@/lib/href";
import {
  formatRelativeDate,
  useStableReleases,
} from "@/lib/useGithubReleases";
import { trackEvent } from "@/lib/matomo";

export function WelcomeScene() {
  const { t } = useLingui();
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();
  const { releases } = useStableReleases();
  const latest = releases?.[0];

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showTextReveal = mounted && !reducedMotion;

  return (
    <section
      id="top"
      className="snap-section relative flex min-h-screen w-full items-center overflow-hidden px-4 pb-24 pt-32 lg:pb-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-[color:var(--color-foreground)] opacity-[0.16] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_65%_70%_at_50%_40%,black_10%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-22%] h-[600px] w-[1150px] -translate-x-1/2 rounded-full blur-3xl [background:radial-gradient(closest-side,color-mix(in_oklch,var(--color-primary)_26%,transparent),transparent_80%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[4%] h-[280px] w-[560px] -translate-x-1/2 rounded-full blur-3xl [background:radial-gradient(closest-side,color-mix(in_oklch,var(--color-primary)_13%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[240px] [background:linear-gradient(to_top,color-mix(in_oklch,var(--color-accent)_60%,transparent),transparent)]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
        <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <a
            href={withBase(
              latest
                ? `/releases/${encodeURIComponent(latest.tag_name)}`
                : "/releases",
            )}
            className={cn(
              "group relative inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-1 text-xs font-semibold text-[color:var(--color-muted-foreground)] shadow-sm transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[color:var(--color-primary)]/30 hover:text-[color:var(--color-foreground)]",
              mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--color-primary)]">
              <Sparkles className="h-3 w-3" />
              <Trans>New</Trans>
            </span>
            {latest ? (
              <span className="min-w-0 truncate">
                <span className="font-mono">{latest.tag_name}</span>
                <span className="text-[color:var(--color-muted-foreground)]/80">
                  {" · "}
                  {formatRelativeDate(latest.published_at)}
                </span>
                <span className="hidden sm:inline">
                  {" · "}
                  <Trans>ADT Studio</Trans>
                </span>
              </span>
            ) : (
              <span className="min-w-0 truncate">
                <span className="sm:hidden">
                  <Trans>Now on macOS, Windows, Linux</Trans>
                </span>
                <span className="hidden sm:inline">
                  <Trans>ADT Studio: now on macOS, Windows, Linux</Trans>
                </span>
              </span>
            )}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>

          <h1 className="text-balance font-display font-[620] leading-[0.95] tracking-[-0.02em] [font-optical-sizing:auto] text-[44px] sm:text-[60px] md:text-[80px] lg:text-[96px]">
            {showTextReveal ? (
              <>
                <TextReveal
                  text={t`From PDF to`}
                  split="word"
                  stagger={0.055}
                  delay={0.08}
                  yOffset="55%"
                  blur={10}
                  className="block"
                />
                <TextReveal
                  text={t`accessible books.`}
                  split="word"
                  stagger={0.055}
                  delay={0.34}
                  yOffset="55%"
                  blur={10}
                  className="block text-[color:var(--color-primary)]"
                />
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "block transition-opacity duration-[600ms]",
                    mounted ? "opacity-100" : "opacity-0",
                  )}
                >
                  {t`From PDF to`}
                </span>
                <span
                  className={cn(
                    "block text-[color:var(--color-primary)] transition-opacity duration-[600ms]",
                    mounted ? "opacity-100" : "opacity-0",
                  )}
                  style={{ transitionDelay: "80ms" }}
                >
                  {t`accessible books.`}
                </span>
              </>
            )}
          </h1>

          <p
            className={cn(
              "max-w-xl text-[17px] leading-relaxed text-[color:var(--color-muted-foreground)] transition-opacity duration-[650ms] md:text-lg",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "520ms" }}
          >
            <Trans>
              Turn any textbook into something every student can read, hear,
              see, and understand: audio, structured layouts, translations,
              and sign language, all built in.
            </Trans>
          </p>

          <div
            className={cn(
              "mt-1 flex flex-wrap items-center justify-center gap-3 transition-opacity duration-[650ms] lg:justify-start",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "650ms" }}
          >
            <Magnetic strength={0.25} className="rounded-lg">
              <motion.div
                whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                transition={SPRING_PRESS}
                className="inline-block"
              >
                <Button
                  href={withBase("/download")}
                  size="lg"
                  variant="primary"
                  onClick={() => trackEvent("cta", "download_click", "hero")}
                >
                  <Trans>Download for free</Trans>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Magnetic>
            {DOCS_ENABLED && (
              <SearchTrigger source="hero" className="w-full sm:w-[230px]" />
            )}
          </div>

          <div
            className={cn(
              "mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[color:var(--color-muted-foreground)] transition-opacity duration-[650ms] lg:justify-start",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "780ms" }}
          >
            <span className="font-mono">
              <Trans>MIT licensed</Trans>
            </span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--color-border)]" />
            <span className="font-mono">
              <Trans>Runs locally</Trans>
            </span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--color-border)]" />
            <span className="font-mono">
              <Trans>Windows · macOS · Linux</Trans>
            </span>
          </div>
        </div>

        <div
          className={cn(
            "relative flex justify-center transition-all duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:justify-end",
            mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
          style={{ transitionDelay: "300ms" }}
        >
          <HeroBook />
        </div>
      </div>

      <a
        href={withBase("/#features")}
        aria-label={t`Scroll to next section`}
        className={cn(
          "absolute bottom-6 left-1/2 grid h-10 w-10 -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)] transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[color:var(--color-primary)]/40 hover:text-[color:var(--color-foreground)]",
          mounted ? "opacity-100" : "opacity-0",
        )}
        style={{
          transitionDelay: "950ms",
          animation: mounted
            ? "onboarding-icon-float 4s ease-in-out 1s infinite"
            : undefined,
        }}
      >
        <ChevronDown className="h-4 w-4" />
      </a>
    </section>
  );
}
