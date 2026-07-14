import { Baseline, Hand, Languages, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { EASE_OUT } from "@/lib/ease";
import { trackEvent } from "@/lib/matomo";

// Wipe reveal ease, matched to the other landing scenes (WelcomeScene,
// DemoScene, PdfToBookDiagram all define this locally rather than sharing
// an export).
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

type Lang = "es" | "en" | "pt";

const LANG_CYCLE: Lang[] = ["es", "en", "pt"];

// The sample sentence and its easy-read variant are deliberately plain
// strings, not Lingui macros: the language chip below cycles this content
// on its own, independent of the site's own locale switcher, so it must
// never be swapped out by the page's active i18n catalog.
const SENTENCES: Record<Lang, { full: string; easy: string }> = {
  es: {
    full: "Una noche una madre leopardo llegó al árbol de los monos.",
    easy: "Una leopardo llegó al árbol. Los monos viven ahí.",
  },
  en: {
    full: "One night a mother leopard came to the monkeys' tree.",
    easy: "A leopard came to the tree. The monkeys live there.",
  },
  pt: {
    full: "Uma noite uma mamãe leopardo chegou à árvore dos macacos.",
    easy: "Uma leoparda chegou à árvore. Os macacos moram lá.",
  },
};

const SPEECH_LANG: Record<Lang, string> = {
  es: "es-ES",
  en: "en-US",
  pt: "pt-BR",
};

const WORD_TIMER_MS = 340;
const BOUNDARY_GRACE_MS = 400;
const ENTRANCE_HOLD_MS = 700;
const ENTRANCE_WIPE_MS = 800;

/** Start offset (in the utterance string) of each space-separated word. */
function wordStarts(text: string): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const word of text.split(" ")) {
    starts.push(cursor);
    cursor += word.length + 1;
  }
  return starts;
}

function wordIndexForCharIndex(starts: number[], charIndex: number): number {
  let index = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= charIndex) index = i;
    else break;
  }
  return index;
}

export function HeroBook() {
  const { t } = useLingui();
  const reducedMotion = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [entrancePhase, setEntrancePhase] = useState<
    "flat" | "revealing" | "done"
  >("flat");

  const [lang, setLang] = useState<Lang>("es");
  const [easy, setEasy] = useState(false);
  const [signOn, setSignOn] = useState(false);
  const [readingOn, setReadingOn] = useState(false);
  const [activeWord, setActiveWord] = useState<number | null>(null);

  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boundaryGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // One-shot flat-PDF -> living-book wipe: only runs once motion is allowed
  // and the component has settled past its first (SSR-matching) paint.
  const animateEntrance = mounted && !reducedMotion;

  useEffect(() => {
    if (!animateEntrance || entrancePhase !== "flat") return;
    const holdId = setTimeout(
      () => setEntrancePhase("revealing"),
      ENTRANCE_HOLD_MS,
    );
    return () => clearTimeout(holdId);
  }, [animateEntrance, entrancePhase]);

  useEffect(() => {
    if (entrancePhase !== "revealing") return;
    const doneId = setTimeout(() => setEntrancePhase("done"), ENTRANCE_WIPE_MS);
    return () => clearTimeout(doneId);
  }, [entrancePhase]);

  const sentence = easy ? SENTENCES[lang].easy : SENTENCES[lang].full;
  const words = useMemo(() => sentence.split(" "), [sentence]);
  const starts = useMemo(() => wordStarts(sentence), [sentence]);

  const stopReadAloud = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (wordTimerRef.current) {
      clearInterval(wordTimerRef.current);
      wordTimerRef.current = null;
    }
    if (boundaryGraceRef.current) {
      clearTimeout(boundaryGraceRef.current);
      boundaryGraceRef.current = null;
    }
    setActiveWord(null);
    setReadingOn(false);
  }, []);

  // Cancel speech + timers on unmount.
  useEffect(() => stopReadAloud, [stopReadAloud]);

  const startWordTimer = useCallback(
    (wordCount: number) => {
      let i = 0;
      setActiveWord(0);
      wordTimerRef.current = setInterval(() => {
        i += 1;
        if (i >= wordCount) {
          if (wordTimerRef.current) clearInterval(wordTimerRef.current);
          wordTimerRef.current = null;
          stopReadAloud();
          return;
        }
        setActiveWord(i);
      }, WORD_TIMER_MS);
    },
    [stopReadAloud],
  );

  const startReading = useCallback(() => {
    stopReadAloud();
    setReadingOn(true);
    trackEvent("hero", "read_aloud", lang);

    const supportsSpeech =
      typeof window !== "undefined" && "speechSynthesis" in window;
    if (!supportsSpeech) {
      startWordTimer(words.length);
      return;
    }

    let boundaryReceived = false;
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = SPEECH_LANG[lang];
    utterance.rate = 0.95;
    utterance.onboundary = (event) => {
      boundaryReceived = true;
      if (wordTimerRef.current) {
        clearInterval(wordTimerRef.current);
        wordTimerRef.current = null;
      }
      setActiveWord(wordIndexForCharIndex(starts, event.charIndex));
    };
    utterance.onend = () => stopReadAloud();
    utterance.onerror = () => stopReadAloud();

    setActiveWord(0);
    window.speechSynthesis.speak(utterance);

    // Some Chrome voices never fire `onboundary`. Give it a short grace
    // window, then fall back to a fixed per-word timer.
    boundaryGraceRef.current = setTimeout(() => {
      if (!boundaryReceived) startWordTimer(words.length);
    }, BOUNDARY_GRACE_MS);
  }, [lang, sentence, starts, stopReadAloud, startWordTimer, words.length]);

  const handleReadAloudClick = useCallback(() => {
    if (readingOn) stopReadAloud();
    else startReading();
  }, [readingOn, stopReadAloud, startReading]);

  const handleEasyClick = useCallback(() => {
    stopReadAloud();
    setEasy((prev) => !prev);
  }, [stopReadAloud]);

  const handleLangClick = useCallback(() => {
    stopReadAloud();
    setLang((prev) => {
      const next = LANG_CYCLE[(LANG_CYCLE.indexOf(prev) + 1) % LANG_CYCLE.length];
      trackEvent("hero", "language", next);
      return next;
    });
  }, [stopReadAloud]);

  const handleSignClick = useCallback(() => {
    setSignOn((prev) => !prev);
  }, []);

  const illustrationSrc = `${import.meta.env.BASE_URL}demos/hero/momo-illustration.jpg`;
  const signVideoSrc = `${import.meta.env.BASE_URL}demos/hero/sign-loop.mp4`;
  const signPosterSrc = `${import.meta.env.BASE_URL}demos/hero/sign-loop-poster.jpg`;

  const illustrationAlt = t`Watercolor illustration from the book Momo: a leopard arriving at a tree where monkeys live`;
  const cardAriaLabel = t`Interactive sample of an accessible book`;

  const entranceInitial = reducedMotion
    ? undefined
    : { opacity: 0, y: 18, rotate: -3 };
  const entranceAnimate = reducedMotion
    ? undefined
    : { opacity: 1, y: 0, rotate: 0 };

  return (
    <motion.div
      role="group"
      aria-label={cardAriaLabel}
      className="relative w-full max-w-[470px]"
      initial={entranceInitial}
      animate={entranceAnimate}
      transition={{ duration: 0.8, ease: EASE_OUT_QUINT }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)]"
        style={{
          boxShadow:
            "0 42px 80px -32px rgba(0,0,0,.28), 0 8px 24px rgba(0,0,0,.08)",
        }}
      >
        <div className="relative">
          <div aria-hidden>
            <TopBar
              chipLabel="ADT"
              chipClassName="bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
            />
          </div>

          <div className="px-4 pb-4 pt-3">
            <img
              src={illustrationSrc}
              alt={illustrationAlt}
              className="h-[190px] w-full rounded-lg object-cover sm:h-[210px]"
            />

            <div
              className="relative mt-4 min-h-[76px] text-[15px] leading-relaxed sm:min-h-[58px] sm:text-base"
              aria-live="off"
            >
              {reducedMotion ? (
                <SentenceWords
                  words={words}
                  activeWord={readingOn ? activeWord : null}
                />
              ) : (
                <AnimatePresence initial={false}>
                  <motion.p
                    key={`${lang}-${easy}`}
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                  >
                    <SentenceWords
                      words={words}
                      activeWord={readingOn ? activeWord : null}
                    />
                  </motion.p>
                </AnimatePresence>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--color-border)] pt-3.5">
              <RailButton
                Icon={Volume2}
                label={t`Read aloud`}
                ariaLabel={t`Read the sentence aloud`}
                active={readingOn}
                onClick={handleReadAloudClick}
              />
              <RailButton
                Icon={Baseline}
                label={t`Easy read`}
                ariaLabel={t`Switch to easy-read text`}
                active={easy}
                onClick={handleEasyClick}
              />
              <RailButton
                Icon={Languages}
                label={lang.toUpperCase()}
                ariaLabel={t`Change the sentence language`}
                active={lang !== "es"}
                onClick={handleLangClick}
              />
              <RailButton
                Icon={Hand}
                label={t`Sign language`}
                ariaLabel={t`Show a sign language interpreter`}
                active={signOn}
                onClick={handleSignClick}
              />
            </div>
          </div>

          {signOn && (
            <div className="absolute right-7 top-[60px] z-10 w-[140px] overflow-hidden rounded-lg border border-[color:var(--color-border)] shadow-md">
              {reducedMotion ? (
                <img src={signPosterSrc} alt="" aria-hidden className="block w-full" />
              ) : (
                <video
                  className="block w-full"
                  muted
                  loop
                  playsInline
                  autoPlay
                  poster={signPosterSrc}
                  src={signVideoSrc}
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>

        {animateEntrance && entrancePhase !== "done" && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[color:var(--color-card)] grayscale saturate-50 contrast-90 transition-[clip-path] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              clipPath:
                entrancePhase === "flat"
                  ? "inset(0% 0% 0% 0%)"
                  : "inset(0% 0% 0% 100%)",
            }}
          >
            <TopBar chipLabel="PDF" chipClassName="bg-red-50 text-red-600" />
            <div className="px-4 pb-4 pt-3">
              <img
                src={illustrationSrc}
                alt=""
                className="h-[190px] w-full rounded-lg object-cover sm:h-[210px]"
              />
              <div className="mt-4 min-h-[76px] text-[15px] leading-relaxed opacity-40 sm:min-h-[58px] sm:text-base">
                {SENTENCES.es.full}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--color-border)] pt-3.5 opacity-30">
                {[Volume2, Baseline, Languages, Hand].map((Icon, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--color-muted-foreground)]"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SentenceWords({
  words,
  activeWord,
}: {
  words: string[];
  activeWord: number | null;
}) {
  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          className={cn(
            "rounded px-0.5 transition-colors duration-150",
            i === activeWord && "bg-amber-200/70",
          )}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function TopBar({
  chipLabel,
  chipClassName,
}: {
  chipLabel: string;
  chipClassName: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[color:var(--color-border)] px-4 py-2.5">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-muted-foreground)]/35" />
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-muted-foreground)]/35" />
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-muted-foreground)]/35" />
      </span>
      <span className="font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
        Momo · 4/22
      </span>
      <span
        className={cn(
          "ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide",
          chipClassName,
        )}
      >
        {chipLabel}
      </span>
    </div>
  );
}

function RailButton({
  Icon,
  label,
  ariaLabel,
  active,
  onClick,
}: {
  Icon: LucideIcon;
  label: ReactNode;
  ariaLabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-card)]",
        active
          ? "border-[color:var(--color-primary)]/30 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
          : "border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
