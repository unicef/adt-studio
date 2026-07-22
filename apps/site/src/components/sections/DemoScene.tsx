import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Pause,
  Play,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { DEMOS, type Demo } from "@/data/demos";
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [activeKey, setActiveKey] = useState<string>(DEMOS[0].key);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
      id="demos"
      className="snap-section relative flex min-h-[100svh] flex-col bg-[color:var(--color-background)] px-4 pb-8 pt-20 md:px-8 lg:h-[100svh] lg:overflow-hidden lg:px-10 lg:pb-10"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center lg:min-h-0 lg:justify-start">
        <Reveal className="shrink-0">
          <SectionEyebrow label={t`See it in action`} />
          <h2 className="mt-3 max-w-2xl text-balance text-2xl font-semibold leading-[1.12] tracking-tight md:text-3xl lg:text-[34px]">
            <Trans>Watch a flat PDF become an accessible book.</Trans>
          </h2>
        </Reveal>

        <Reveal delay={0.12} className="mt-6 flex flex-col lg:mt-8 lg:min-h-0 lg:flex-1">
          <div className="hidden lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
            <div
              role="tablist"
              aria-label={t`Demo videos`}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-col lg:gap-1.5 lg:overflow-y-auto lg:pb-0 lg:pr-1"
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

            <div className="flex min-h-0 flex-col">
              <div
                role="tabpanel"
                id="demo-tabpanel"
                aria-label={i18n._(active.title)}
                className="relative grid w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-slate-950 lg:h-full lg:min-h-0 lg:flex-1"
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
                    onExpand={() => setLightboxIndex(activeIndex)}
                  />
                ) : (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={active.key}
                      initial={{ opacity: 0, scale: 0.99 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.99 }}
                      transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
                      className="h-full [grid-area:1/1]"
                    >
                      <DemoPlayer
                        demo={active}
                        reducedMotion={reducedMotion}
                        nextTitle={i18n._(nextDemo.title)}
                        onEnded={handleEnded}
                        onManualPlay={handleManualPlay}
                        onExpand={() => setLightboxIndex(activeIndex)}
                      />
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12} className="mt-6 lg:hidden">
          <ul role="list" className="flex flex-col gap-4">
            {DEMOS.map((demo, index) => (
              <DemoMobileCard
                key={demo.key}
                demo={demo}
                title={i18n._(demo.title)}
                duration={formatDuration(demo.seconds)}
                onOpen={() => {
                  trackEvent("demo", "play", demo.key);
                  setLightboxIndex(index);
                }}
              />
            ))}
          </ul>
        </Reveal>
      </div>

      {lightboxIndex !== null && (
        <DemoLightbox
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
}

function DemoMobileCard({
  demo,
  title,
  duration,
  onOpen,
}: {
  demo: Demo;
  title: string;
  duration: string;
  onOpen: () => void;
}) {
  const { t } = useLingui();

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t`Play ${title} fullscreen`}
        className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-slate-950"
      >
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={`${import.meta.env.BASE_URL}demos/${demo.file}.mp4`}
          poster={`${import.meta.env.BASE_URL}demos/${demo.file}-poster.jpg`}
          muted
          playsInline
          preload="none"
          tabIndex={-1}
        />

        <span className="absolute inset-0 grid place-items-center bg-slate-950/10 transition-colors group-hover:bg-slate-950/20">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-50/95 text-[color:var(--color-foreground)] shadow-lg transition-transform group-active:scale-95">
            <Play className="h-6 w-6" />
          </span>
        </span>

        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent px-4 pb-3 pt-8">
          <span className="text-left text-sm font-semibold text-slate-50">{title}</span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-50/70">
            {duration}
          </span>
        </span>
      </button>
    </li>
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
  onExpand,
}: {
  demo: Demo;
  reducedMotion: boolean;
  nextTitle: string;
  onEnded: () => void;
  onManualPlay: () => void;
  onExpand: () => void;
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
    // The desktop player is CSS-hidden below lg; don't autoplay/buffer it on
    // mobile viewports (offsetParent is null when display:none).
    if (videoEl.offsetParent === null) return;
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
    <div className="flex h-full w-full flex-col bg-slate-950 [grid-area:1/1]">
      <div className="relative aspect-video w-full lg:aspect-auto lg:min-h-0 lg:flex-1">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
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

      {/* Controls sit in their own strip below the frame so the track never
          overlaps the captions burned into the videos. */}
      <div className="flex items-center gap-3 border-t border-slate-50/10 px-4 py-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t`Pause demo` : t`Play demo`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50/95 text-[color:var(--color-foreground)] transition-transform hover:scale-105"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <span
          aria-hidden="true"
          className="h-1 flex-1 overflow-hidden rounded-full bg-slate-50/20"
        >
          <span
            className="block h-full rounded-full bg-slate-50"
            style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
          />
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-50/60">
          {formatDuration(demo.seconds)}
        </span>
        <button
          type="button"
          onClick={onExpand}
          aria-label={t`Watch fullscreen`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50/95 text-[color:var(--color-foreground)] transition-transform hover:scale-105"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 48 : -48,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -48 : 48,
  }),
};

const FADE_VARIANTS = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

const FOCUSABLE_SELECTOR = "button:not([disabled]), video";

function DemoLightbox({
  index,
  onIndexChange,
  onClose,
}: {
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const reducedMotion = !!useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [direction, setDirection] = useState(0);

  const demo = DEMOS[index];

  const goTo = useCallback(
    (nextIndex: number, dir: number) => {
      setDirection(dir);
      onIndexChange(((nextIndex % DEMOS.length) + DEMOS.length) % DEMOS.length);
    },
    [onIndexChange],
  );

  const goNext = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0, -1);
          break;
        case "End":
          e.preventDefault();
          goTo(DEMOS.length - 1, 1);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab": {
          const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
            FOCUSABLE_SELECTOR,
          );
          if (!focusables || focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
          break;
        }
        default:
          break;
      }
    },
    [goNext, goPrev, goTo, onClose],
  );

  const handleSwipeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      swipeStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [],
  );

  const handleSwipeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  const handleStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (typeof document === "undefined") return null;

  const variants = reducedMotion ? FADE_VARIANTS : SLIDE_VARIANTS;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t`Demo videos`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950 outline-none"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate font-semibold text-slate-50">
            {i18n._(demo.title)}
          </span>
          <span
            className="shrink-0 font-mono text-xs text-slate-50/60"
            aria-label={t`Demo ${index + 1} of ${DEMOS.length}`}
          >
            {index + 1} / {DEMOS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t`Close`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-50 transition-colors hover:bg-slate-50/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-4"
        onClick={handleStageClick}
      >
        <button
          type="button"
          onClick={goPrev}
          aria-label={t`Previous demo`}
          className="absolute left-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-50/10 text-slate-50 transition-colors hover:bg-slate-50/20 md:left-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div
          className="grid h-full w-full place-items-center"
          onPointerDown={handleSwipeStart}
          onPointerUp={handleSwipeEnd}
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={demo.key}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: reducedMotion ? 0.15 : 0.3,
                ease: EASE_OUT_QUINT,
              }}
              onClick={handleStageClick}
              className="grid h-full w-full place-items-center [grid-area:1/1]"
            >
              <video
                key={demo.key}
                controls
                autoPlay
                muted
                playsInline
                preload="metadata"
                className="max-h-full max-w-full object-contain"
                src={`${import.meta.env.BASE_URL}demos/${demo.file}.mp4`}
                poster={`${import.meta.env.BASE_URL}demos/${demo.file}-poster.jpg`}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label={t`Next demo`}
          className="absolute right-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-slate-50/10 text-slate-50 transition-colors hover:bg-slate-50/20 md:right-4"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-1 px-4 py-4">
        {DEMOS.map((d, i) => (
          <button
            key={d.key}
            type="button"
            onClick={() => goTo(i, i > index ? 1 : -1)}
            aria-label={t`Go to ${i18n._(d.title)}`}
            aria-current={i === index}
            className="grid h-11 w-11 shrink-0 place-items-center"
          >
            <span
              className={cn(
                "block h-2 w-2 rounded-full transition-colors",
                i === index ? "bg-slate-50" : "bg-slate-50/30",
              )}
            />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
