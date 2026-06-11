import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimEnrich } from "@/components/scenes/AnimEnrich";
import { AnimExport } from "@/components/scenes/AnimExport";
import { AnimPdfPreset } from "@/components/scenes/AnimPdfPreset";
import { AnimPipeline } from "@/components/scenes/AnimPipeline";
import { AnimPresetPicker } from "@/components/scenes/AnimPresetPicker";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { cn } from "@/lib/cn";
import { useInViewLive } from "@/lib/useScrollProgress";

type Feature = {
  num: string;
  title: MessageDescriptor;
  body: MessageDescriptor;
  Anim: (props: { progress: number }) => React.ReactElement;
};

const FEATURES: Feature[] = [
  {
    num: "01",
    title: msg`Start from a PDF`,
    body: msg`Drop in a PDF to kick things off. ADT Studio organizes it into a new book project so you don't start from zero.`,
    Anim: AnimPdfPreset,
  },
  {
    num: "02",
    title: msg`Pick a preset`,
    body: msg`Choose a preset that matches your content — textbook, storyboard, reference, or custom — and ADT Studio tailors the pipeline accordingly.`,
    Anim: AnimPresetPicker,
  },
  {
    num: "03",
    title: msg`Run the pipeline`,
    body: msg`Configure each stage — extract, storyboard, layout — then let ADT Studio build the book. Review the output, correct anything that needs a human touch.`,
    Anim: AnimPipeline,
  },
  {
    num: "04",
    title: msg`Edit & enrich`,
    body: msg`Layer on translations, text-to-speech, and a glossary — all inspectable, cacheable, reversible.`,
    Anim: AnimEnrich,
  },
  {
    num: "05",
    title: msg`Export to a reader`,
    body: msg`Package the finished book with every accessibility feature baked in — ready for a kid to open, listen, and read along.`,
    Anim: AnimExport,
  },
];

const DURATIONS = [4000, 3500, 7000, 12000, 16500];
const HOLD_AFTER_MS = [1600, 1600, 500, 1600, 1600];
const FEATURE_COUNT = FEATURES.length;

export function CarouselScene() {
  const { i18n } = useLingui();
  const { ref, inView } = useInViewLive<HTMLElement>({ threshold: 0.35 });
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [playing, setPlaying] = useState(true);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing || holding || !inView) return;
    let raf: number;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const dur = DURATIONS[idx] ?? 12000;
        const np = p + dt / dur;
        if (np >= 1) {
          if (idx < FEATURE_COUNT - 1 && !holdTimer.current) {
            setHolding(true);
            holdTimer.current = setTimeout(() => {
              holdTimer.current = null;
              setIdx((i) => i + 1);
              setProgress(0);
              setHolding(false);
            }, HOLD_AFTER_MS[idx] ?? 1200);
          }
          return 1;
        }
        return np;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, holding, idx, inView]);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const goTo = (i: number) => {
    setHolding(false);
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setIdx(i);
    setProgress(0);
    setPlaying(true);
  };

  return (
    <section
      ref={ref}
      id="carousel"
      className="snap-section relative flex min-h-screen items-center border-y border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 py-24 lg:py-32"
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 md:grid-cols-[1fr_1.35fr]">
        <div className="flex flex-col">
          <SectionEyebrow label={i18n._(msg`How it works`)} className="mb-5" />

          <div className="relative min-h-[170px]">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                  i === idx
                    ? "relative opacity-100"
                    : "pointer-events-none absolute inset-0 translate-y-2.5 opacity-0",
                )}
              >
                <div className="mb-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--color-primary)]">
                  {f.num} / {String(FEATURE_COUNT).padStart(2, "0")}
                </div>
                <h2 className="mb-3.5 text-3xl font-semibold leading-tight tracking-tight text-[color:var(--color-foreground)]">
                  {i18n._(f.title)}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                  {i18n._(f.body)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-1.5">
            {FEATURES.map((f, i) => {
              const done = i < idx;
              const active = i === idx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    active
                      ? "border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-sm"
                      : "border-transparent bg-transparent hover:bg-[color:var(--color-accent)]/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      done
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]"
                        : active
                          ? "border-[color:var(--color-primary)] bg-[color:var(--color-card)]"
                          : "border-[color:var(--color-border)] bg-transparent",
                    )}
                  >
                    {done && (
                      <Check
                        className="h-2.5 w-2.5 text-[color:var(--color-primary-foreground)]"
                        strokeWidth={3}
                      />
                    )}
                    {active && (
                      <span className="h-2 w-2 rounded-full bg-[color:var(--color-primary)]" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      active
                        ? "font-semibold text-[color:var(--color-foreground)]"
                        : "font-medium text-[color:var(--color-muted-foreground)]",
                    )}
                  >
                    {i18n._(f.title)}
                  </span>
                  {active && (
                    <span className="h-[3px] w-14 overflow-hidden rounded bg-[color:var(--color-muted)]">
                      <span
                        className="block h-full bg-[color:var(--color-primary)]"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="mt-3 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[color:var(--color-muted-foreground)] transition-colors hover:bg-[color:var(--color-accent)]/60 hover:text-[color:var(--color-foreground)]"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? <Trans>Pause</Trans> : <Trans>Play</Trans>}
          </button>
        </div>

        <div
          className="relative aspect-[4/3] w-full overflow-hidden rounded-[14px] border border-[color:var(--color-border)] bg-[color:var(--color-card)]"
          style={{
            boxShadow:
              "0 10px 30px -12px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.04)",
          }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className={cn(
                "absolute inset-0 transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                i === idx ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={i !== idx}
            >
              <f.Anim progress={i === idx ? progress : 0} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
