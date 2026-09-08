import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Maximize2, Pause, Play } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { DEMOS, type Demo } from "@/data/demos";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/matomo";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/motion";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function demoSrc(demo: Demo, ext: "mp4" | "jpg"): string {
  const base = `${import.meta.env.BASE_URL}demos/${demo.file}`;
  return ext === "mp4" ? `${base}.mp4` : `${base}-poster.jpg`;
}

export function Demos() {
  const { t, i18n } = useLingui();
  const reduced = useReducedMotion();
  const [activeKey, setActiveKey] = useState(DEMOS[0].key);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const active = DEMOS.find((demo) => demo.key === activeKey) ?? DEMOS[0];

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView && !reduced) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [inView, reduced, activeKey]);

  const select = useCallback((key: string) => {
    setActiveKey((previous) => {
      if (previous !== key) trackEvent("demo", "select", key);
      return key;
    });
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const fullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    trackEvent("demo", "fullscreen", active.key);
    if (video.requestFullscreen) void video.requestFullscreen();
    else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  };

  return (
    <section id="demos" ref={sectionRef} className="snap-section scroll-mt-[72px] md:scroll-mt-0 flex flex-col justify-center bg-white py-14">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow={<Trans>See it in action</Trans>}
            title={<Trans>Watch a flat PDF become a book that reads itself.</Trans>}
            body={
              <Trans>
                Real textbooks, before and after. Every clip is the exported
                book running in a browser, exactly as a student would open it.
              </Trans>
            }
          />
        </Reveal>

        <Reveal className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="group relative overflow-hidden rounded-2xl border border-ink-line bg-ink shadow-window">
            <AnimatePresence mode="wait" initial={false}>
              <motion.video
                key={active.key}
                ref={videoRef}
                src={demoSrc(active, "mp4")}
                poster={demoSrc(active, "jpg")}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={i18n._(active.title)}
                className="aspect-video w-full object-cover"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              />
            </AnimatePresence>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end gap-4 sm:justify-between bg-gradient-to-t from-ink/70 to-transparent p-4 sm:p-5">
              <div className="hidden min-w-0 sm:block">
                <p className="truncate font-display text-lg font-extrabold text-white sm:text-xl">
                  {i18n._(active.title)}
                </p>
                <p className="text-sm text-white/75">{i18n._(active.blurb)}</p>
              </div>
              <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={playing ? t`Pause` : t`Play`}
                  className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30"
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={fullscreen}
                  aria-label={t`Watch fullscreen`}
                  className="grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30"
                >
                  <Maximize2 className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="-mt-2 sm:hidden">
            <p className="font-display text-lg font-extrabold text-ink">{i18n._(active.title)}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{i18n._(active.blurb)}</p>
          </div>

          <ul
            role="tablist"
            aria-label={t`Demo clips`}
            className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {DEMOS.map((demo) => {
              const isActive = demo.key === active.key;
              return (
                <li key={demo.key} className="relative shrink-0 lg:shrink">
                  {isActive ? (
                    <motion.span
                      aria-hidden
                      layoutId="demo-active"
                      className="absolute inset-0 rounded-xl border border-brand-soft bg-brand-tint/50 shadow-card"
                      transition={SPRING_LAYOUT}
                    />
                  ) : null}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => select(demo.key)}
                    className={cn(
                      "relative flex w-[232px] items-center gap-3 rounded-xl p-2 text-left transition-colors duration-200 lg:w-full",
                      isActive ? "text-ink" : "text-ink-soft hover:bg-brand-tint/60 hover:text-ink",
                    )}
                  >
                    <img
                      src={demoSrc(demo, "jpg")}
                      alt=""
                      width={80}
                      height={45}
                      loading="lazy"
                      className="h-[45px] w-20 shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold leading-tight">
                        {i18n._(demo.title)}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-mute">
                        {formatDuration(demo.seconds)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
