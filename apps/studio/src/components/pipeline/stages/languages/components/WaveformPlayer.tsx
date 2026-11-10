import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { WAVEFORM_BARS, loadWaveform, peekWaveform } from "./waveform-cache"

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * How long a row must stay on screen before its audio is decoded. In a
 * virtualized list most mounted rows are ones the user is scrolling past, and
 * decoding each of them is what made scrolling expensive. Waiting for the
 * scroll to settle means only rows the user actually stops on do the work; the
 * delay is invisible next to the decode itself.
 */
const DECODE_SETTLE_MS = 150;

/** Placeholder bars while nothing is decoded yet — hoisted so the render below
 *  does not rebuild a 120-element array on every pass. */
const PLACEHOLDER_BARS: number[] = new Array<number>(WAVEFORM_BARS).fill(0.1);

/** Global stop handle — only one waveform plays at a time */
let activePlayerStop: (() => void) | null = null;

export function WaveformPlayer({
  audioUrl,
  onTimeUpdate,
  onPlayingChange,
  accent,
  label,
}: {
  audioUrl: string;
  onTimeUpdate?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Hex accent for the played portion. Omitted keeps the classic pink. */
  accent?: string;
  label?: string;
}) {
  const { t } = useLingui();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Seeded from the cache so a row scrolled back into view paints its waveform
  // on the first frame instead of flashing the placeholder and decoding again.
  const [waveform, setWaveform] = useState<number[] | null>(() => peekWaveform(audioUrl) ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useEffect(() => {
    const cached = peekWaveform(audioUrl);
    if (cached) {
      setWaveform(cached);
      return;
    }
    setWaveform(null);
    let cancelled = false;
    // Rows the user scrolls straight past unmount before this fires, so they
    // never start a fetch or a decode at all.
    const timer = window.setTimeout(() => {
      void loadWaveform(audioUrl).then((bars) => {
        if (!cancelled) setWaveform(bars);
      });
    }, DECODE_SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audioUrl]);

  // Time update loop
  const tick = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) {
      setProgress(el.currentTime);
      onTimeUpdateRef.current?.(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio(audioUrl);
      el.addEventListener("loadedmetadata", () => setDuration(el.duration));
      el.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
        onPlayingChangeRef.current?.(false);
        onTimeUpdateRef.current?.(0);
        cancelAnimationFrame(rafRef.current);
      });
      audioRef.current = el;
    }
    return audioRef.current;
  }, [audioUrl]);

  const stopThis = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setProgress(0);
    onPlayingChangeRef.current?.(false);
    onTimeUpdateRef.current?.(0);
    if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
  }, []);
  const stopThisRef = useRef(stopThis);
  stopThisRef.current = stopThis;

  const startPlaying = useCallback(
    (el: HTMLAudioElement) => {
      // Stop any other playing instance first
      if (activePlayerStop && activePlayerStop !== stopThisRef.current)
        activePlayerStop();
      activePlayerStop = stopThisRef.current;
      el.play();
      setPlaying(true);
      onPlayingChangeRef.current?.(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const toggle = useCallback(() => {
    const el = ensureAudio();
    if (playing) {
      el.pause();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      onPlayingChangeRef.current?.(false);
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
    } else {
      startPlaying(el);
    }
  }, [playing, ensureAudio, startPlaying]);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ensureAudio();
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      el.currentTime = ratio * (el.duration || 0);
      setProgress(el.currentTime);
      if (!playing) {
        startPlaying(el);
      }
    },
    [ensureAudio, playing, startPlaying],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const progressRatio = duration > 0 ? progress / duration : 0;

  return (
    <div className={cn("flex items-center w-full", accent ? "gap-3" : "gap-2 mt-1.5")}>
      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={
          label
            ? playing
              ? t`Pause ${label}`
              : t`Play ${label}`
            : playing
              ? t`Pause`
              : t`Play`
        }
        aria-pressed={playing}
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full cursor-pointer",
          accent
            ? "size-9 transition-[background-color,color,transform,box-shadow] duration-200 ease-out hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[color-mix(in_srgb,var(--wave-accent)_55%,transparent)]"
            : "w-6 h-6 transition-all",
          playing
            ? accent
              ? "text-white shadow-sm"
              : "bg-pink-500 text-white hover:bg-pink-600 scale-110"
            : accent
              ? "text-[var(--wave-accent)] dark:text-[color-mix(in_oklab,var(--wave-accent)_70%,white)]"
              : "bg-muted text-muted-foreground hover:scale-110",
          !playing && !accent && "hover:bg-pink-100 hover:text-pink-600",
        )}
        style={
          accent
            ? ({
                ["--wave-accent" as string]: accent,
                backgroundColor: playing ? accent : `color-mix(in srgb, ${accent} 14%, transparent)`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {playing ? (
          <Pause className={accent ? "size-3.5" : "w-2.5 h-2.5"} />
        ) : (
          <Play className={accent ? "size-3.5 ml-0.5" : "w-2.5 h-2.5 ml-0.5"} />
        )}
      </button>

      {/* Waveform */}
      <div
        ref={waveContainerRef}
        onClick={seek}
        className="flex-1 flex items-center h-8 cursor-pointer"
        aria-hidden={accent ? true : undefined}
      >
        {(waveform ?? PLACEHOLDER_BARS).map(
          (amp, i) => {
            const barRatio = (i + 0.5) / WAVEFORM_BARS;
            const isPast = barRatio <= progressRatio;
            const minH = 1;
            const maxH = 28;
            const h = Math.max(minH, amp * maxH);
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  isPast && !accent
                    ? "bg-pink-400"
                    : !isPast
                      ? accent
                        ? "bg-muted-foreground/25 dark:bg-muted-foreground/35"
                        : "bg-gray-300"
                      : "",
                )}
                style={{
                  height: `${h}px`,
                  minWidth: "1px",
                  ...(isPast && accent ? { backgroundColor: accent } : null),
                }}
              />
            );
          },
        )}
      </div>

      {/* Time */}
      <span className={cn("shrink-0 tabular-nums text-muted-foreground text-right", accent ? "w-9 font-mono text-[11px]" : "text-[10px] w-8")}>
        {duration > 0 ? formatTime(playing ? progress : duration) : ""}
      </span>
    </div>
  );
}
