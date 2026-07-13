import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { DEMOS, DEMO_SELECT_EVENT, type Demo } from "@/data/demos";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/matomo";

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const TAB_SHAPE = "rounded-full lg:rounded-xl";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DemoScene() {
  const { t, i18n } = useLingui();
  const reducedMotion = !!useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [activeKey, setActiveKey] = useState<string>(DEMOS[0].key);

  const activeIndex = useMemo(
    () => DEMOS.findIndex((d) => d.key === activeKey),
    [activeKey],
  );
  const active = DEMOS[activeIndex];
  const nextDemo = DEMOS[(activeIndex + 1) % DEMOS.length];

  const selectDemoKey = useCallback((key: string) => {
    setActiveKey((prev) => {
      if (prev === key) return prev;
      trackEvent("demo", "select", key);
      return key;
    });
  }, []);

  useEffect(() => {
    function handleSelect(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail?.key || !DEMOS.some((d) => d.key === detail.key)) return;
      selectDemoKey(detail.key);
      sectionRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
    document.addEventListener(DEMO_SELECT_EVENT, handleSelect);
    return () => document.removeEventListener(DEMO_SELECT_EVENT, handleSelect);
  }, [selectDemoKey, reducedMotion]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (index + 1) % DEMOS.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (index - 1 + DEMOS.length) % DEMOS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = DEMOS.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const target = DEMOS[nextIndex];
      selectDemoKey(target.key);
      tabRefs.current[nextIndex]?.focus();
    },
    [selectDemoKey],
  );

  const handleEnded = useCallback(() => {
    selectDemoKey(nextDemo.key);
  }, [selectDemoKey, nextDemo.key]);

  const handleManualPlay = useCallback(() => {
    trackEvent("demo", "play", active.key);
  }, [active.key]);

  return (
    <section
      ref={sectionRef}
      id="demos"
      className="snap-section relative flex min-h-screen items-center bg-[color:var(--color-background)] py-24 lg:py-32"
    >
      <div className="mx-auto w-full max-w-6xl px-4 md:px-10">
        <Reveal>
          <SectionEyebrow label={t`See it in action`} />
          <h2 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-[44px]">
            <Trans>Watch a flat PDF become an accessible book.</Trans>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--color-muted-foreground)] md:text-[17px]">
            <Trans>
              No mockups: every clip is an unedited screen capture of a real
              textbook moving through the pipeline.
            </Trans>
          </p>
        </Reveal>

        <Reveal delay={0.12} className="mt-12">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr] lg:items-start lg:gap-10">
            <div
              role="tablist"
              aria-label={t`Demo videos`}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {DEMOS.map((demo, index) => (
                <DemoTab
                  key={demo.key}
                  demo={demo}
                  index={index}
                  isActive={demo.key === activeKey}
                  reducedMotion={reducedMotion}
                  title={i18n._(demo.title)}
                  blurb={i18n._(demo.blurb)}
                  duration={formatDuration(demo.seconds)}
                  onSelect={selectDemoKey}
                  onKeyDown={handleTabKeyDown}
                  registerRef={(el) => {
                    tabRefs.current[index] = el;
                  }}
                />
              ))}
            </div>

            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-muted-foreground)]">
                <Trans>Before · PDF → After · Accessible web</Trans>
              </div>

              <div
                role="tabpanel"
                id="demo-tabpanel"
                aria-label={i18n._(active.title)}
                className="relative aspect-video w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)]"
                style={{
                  boxShadow:
                    "0 30px 60px -24px rgba(0,0,0,.18), 0 4px 14px rgba(0,0,0,.06)",
                }}
              >
                {reducedMotion ? (
                  <DemoPlayer
                    key={active.key}
                    demo={active}
                    reducedMotion={reducedMotion}
                    nextTitle={i18n._(nextDemo.title)}
                    onEnded={handleEnded}
                    onManualPlay={handleManualPlay}
                  />
                ) : (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={active.key}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
                      className="absolute inset-0"
                    >
                      <DemoPlayer
                        demo={active}
                        reducedMotion={reducedMotion}
                        nextTitle={i18n._(nextDemo.title)}
                        onEnded={handleEnded}
                        onManualPlay={handleManualPlay}
                      />
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DemoTab({
  demo,
  index,
  isActive,
  reducedMotion,
  title,
  blurb,
  duration,
  onSelect,
  onKeyDown,
  registerRef,
}: {
  demo: Demo;
  index: number;
  isActive: boolean;
  reducedMotion: boolean;
  title: string;
  blurb: string;
  duration: string;
  onSelect: (key: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={registerRef}
      type="button"
      role="tab"
      id={`demo-tab-${demo.key}`}
      aria-selected={isActive}
      aria-controls="demo-tabpanel"
      tabIndex={isActive ? 0 : -1}
      onClick={() => onSelect(demo.key)}
      onKeyDown={(e) => onKeyDown(e, index)}
      className={cn(
        "group relative flex shrink-0 snap-start flex-col gap-1 border px-4 py-2.5 text-left transition-all lg:w-full lg:py-3",
        TAB_SHAPE,
        isActive
          ? "border-[color:var(--color-border)]"
          : "border-transparent hover:-translate-y-0.5 hover:bg-[color:var(--color-accent)]/50",
      )}
    >
      {isActive &&
        (reducedMotion ? (
          <span
            className={cn(
              "absolute inset-0 border border-[color:var(--color-primary)]/30 bg-[color:var(--color-primary)]/5",
              TAB_SHAPE,
            )}
          />
        ) : (
          <motion.span
            layoutId="demo-tab-active"
            className={cn(
              "absolute inset-0 border border-[color:var(--color-primary)]/30 bg-[color:var(--color-primary)]/5",
              TAB_SHAPE,
            )}
            transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
          />
        ))}
      <span className="relative z-10 flex items-center justify-between gap-3">
        <span
          className={cn(
            "whitespace-nowrap text-sm font-semibold lg:whitespace-normal",
            isActive
              ? "text-[color:var(--color-foreground)]"
              : "text-[color:var(--color-muted-foreground)]",
          )}
        >
          {title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
          {duration}
        </span>
      </span>
      <span className="relative z-10 hidden text-xs leading-relaxed text-[color:var(--color-muted-foreground)] lg:block">
        {blurb}
      </span>
    </button>
  );
}

function DemoPlayer({
  demo,
  reducedMotion,
  nextTitle,
  onEnded,
  onManualPlay,
}: {
  demo: Demo;
  reducedMotion: boolean;
  nextTitle: string;
  onEnded: () => void;
  onManualPlay: () => void;
}) {
  const { t } = useLingui();
  const videoRef = useRef<HTMLVideoElement>(null);
  const upNextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [awaitingClick, setAwaitingClick] = useState(reducedMotion);
  const [showUpNext, setShowUpNext] = useState(false);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || reducedMotion) return;
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => setAwaitingClick(true));
    }
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
      if (upNextTimeoutRef.current) clearTimeout(upNextTimeoutRef.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      setAwaitingClick(false);
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      onManualPlay();
    } else {
      videoEl.pause();
    }
  }, [onManualPlay]);

  const handleTimeUpdate = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const duration = videoEl.duration || demo.seconds;
    setProgress(duration ? videoEl.currentTime / duration : 0);
  }, [demo.seconds]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    if (reducedMotion) {
      setAwaitingClick(true);
      return;
    }
    setShowUpNext(true);
    upNextTimeoutRef.current = setTimeout(() => {
      onEnded();
    }, 900);
  }, [reducedMotion, onEnded]);

  return (
    <div className="relative h-full w-full bg-slate-950">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={`${import.meta.env.BASE_URL}demos/${demo.file}.mp4`}
        poster={`${import.meta.env.BASE_URL}demos/${demo.file}-poster.jpg`}
        muted
        playsInline
        preload="none"
        controls={false}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {awaitingClick && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={t`Play demo`}
          className="group absolute inset-0 grid place-items-center bg-slate-950/25 transition-colors hover:bg-slate-950/35"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-50/95 text-[color:var(--color-foreground)] shadow-lg transition-transform group-hover:scale-105">
            <Play className="h-6 w-6" />
          </span>
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-slate-950/70 to-transparent px-4 py-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t`Pause demo` : t`Play demo`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-50/95 text-[color:var(--color-foreground)] transition-transform hover:scale-105"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <span
          aria-hidden="true"
          className="h-1 flex-1 overflow-hidden rounded-full bg-slate-50/25"
        >
          <span
            className="block h-full rounded-full bg-slate-50"
            style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
          />
        </span>
      </div>

      {showUpNext && (
        <div
          role="status"
          aria-live="polite"
          className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-medium text-slate-50"
        >
          <Trans>Up next: {nextTitle}</Trans>
        </div>
      )}
    </div>
  );
}
