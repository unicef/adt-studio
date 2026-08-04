import {
  ArrowLeft,
  BookOpen,
  Check,
  Gauge,
  Map,
  Pause,
  Play,
  Sparkles,
  TextQuote,
  Volume2,
  type LucideIcon,
} from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import { KIDS_NARRATOR_ID, type KidsAvatarConfig } from "@adt/types/kids"
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import {
  getBuddyImages,
  type BuddyExpression,
} from "@/features/kids/assets/buddy-images"
import {
  getPickPhrases,
  pickRandomPhrase,
  type BuddyPhrase,
} from "@/features/kids/lib/buddy-phrases"
import {
  playBuddyLine,
  playBuddyLineSequence,
  stopBuddyLine,
} from "@/features/kids/lib/buddy-voice"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { useTouchOnlyDevice } from "@/features/kids/hooks/useTouchOnlyDevice"
import {
  DEFAULT_BUDDY_BACKGROUND,
  KIDS_CHARACTERS,
  getCharacter,
  type KidsCharacter,
} from "@/features/kids/lib/characters"
import {
  kidsAvatarAtom,
  kidsBuddyAtom,
  kidsOnboardingDoneAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { KidsAvatarBuilder } from "@/features/kids/components/KidsAvatarBuilder"
import { isTypingTarget } from "@/features/navigation/lib/typing-target"
import { KIDS_SCROLLBAR_CLASS } from "@/features/kids/lib/kids-styles"
import { cn } from "@/shared/lib/utils"
import { appConfigAtom, type AppFeatures } from "@/shared/state/config.atoms"

type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "pick"
  | "reading-mode"
  | "feature-pages"
  | "feature-help"
  | "feature-abilities"
  | "start"

type NavigationDirection = "forward" | "back"

// The intro always narrates via the kids-voice narrator track and always
// offers the read-to-me / read-myself choice, independent of the book's own
// speech (readAloud) feature — a kids book can ship a narrator voice pack
// even when its page content has no TTS audio.
const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "reading-mode",
  "name",
  "avatar",
  "pick",
  "feature-pages",
  "feature-help",
  "feature-abilities",
  "start",
]

/**
 * Steps that only exist to teach a keyboard shortcut. On a touch device they
 * are worse than redundant — the child is told to press keys that aren't there.
 * The help step survives because "tap your buddy" is the thing a phone user
 * most needs to learn; it just swaps to touch-only wording.
 */
const KEYBOARD_ONLY_STEPS = new Set<OnboardingStep>(["feature-pages"])

// Steps whose content benefits from the full screen width (grids of options).
const WIDE_STEPS = new Set<OnboardingStep>([
  "pick",
  "avatar",
  "feature-abilities",
])

const STEP_LAYOUT_CLASS =
  "flex w-full flex-col items-center justify-center gap-6"
const STEP_TEXT_STACK_CLASS = "flex flex-col items-center gap-3"
const STEP_TITLE_CLASS =
  "text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
const STEP_COPY_CLASS =
  "max-w-xl text-balance text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl"
const PICK_CONFIRM_DELAY_MS = 180

/** Buddy expression per feature-tour step — swaps keep the buddy lively. */
const STEP_EXPRESSIONS: Partial<Record<OnboardingStep, BuddyExpression>> = {
  "feature-pages": "excited",
  "feature-help": "encouraging",
  "feature-abilities": "surprised",
}

/**
 * Neutral-narrator lines for each onboarding step, read in order — the step's
 * title followed by its description where one exists. Keys reuse the same
 * translation keys the step renders (`@adt/types/kids` narrator registry).
 * Steps missing here (e.g. "start") are never narrated and never show the
 * play button — the buddy has already taken over confirmations by then.
 */
const STEP_NARRATOR_LINE_KEYS: Partial<Record<OnboardingStep, string[]>> = {
  welcome: ["kids-onboarding-welcome-title", "kids-onboarding-welcome-copy"],
  "reading-mode": ["kids-onboarding-read-title"],
  name: ["kids-onboarding-name-title"],
  avatar: ["kids-onboarding-avatar-title"],
  pick: ["kids-onboarding-buddy-title"],
  "feature-pages": [
    "kids-onboarding-pages-title",
    "kids-onboarding-pages-copy",
  ],
  "feature-help": ["kids-onboarding-help-title", "kids-onboarding-help-copy"],
  "feature-abilities": ["kids-onboarding-abilities-title"],
}

function animationDelayStyle(index: number, delayMs = 50): CSSProperties {
  return { animationDelay: `${index * delayMs}ms` }
}

export function KidsOnboarding() {
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()
  const appConfig = useAtomValue(appConfigAtom)
  const currentPlayerName = useAtomValue(kidsPlayerNameAtom)
  const setPlayerName = useSetAtom(kidsPlayerNameAtom)
  const setBuddy = useSetAtom(kidsBuddyAtom)
  const [avatar, setAvatar] = useAtom(kidsAvatarAtom)
  const setOnboardingDone = useSetAtom(kidsOnboardingDoneAtom)
  const [readAloud, setReadAloud] = useAtom(readAloudModeAtom)
  const [stepIndex, setStepIndex] = useState(0)
  const [navigationDirection, setNavigationDirection] =
    useState<NavigationDirection>("forward")
  const language = useAtomValue(currentLanguageAtom)
  const roster = useMemo(() => {
    const allowed = appConfig.features.kidsBuddies
    if (!allowed?.length) return KIDS_CHARACTERS
    const filtered = KIDS_CHARACTERS.filter((entry) =>
      allowed.includes(entry.id),
    )
    return filtered.length > 0 ? filtered : KIDS_CHARACTERS
  }, [appConfig.features.kidsBuddies])
  const [playerNameDraft, setPlayerNameDraft] = useState(currentPlayerName)
  // The onboarding always starts on a RANDOM buddy so every child meets a
  // fresh face (rather than always defaulting to the same one).
  const [characterId, setCharacterId] = useState(
    () => roster[Math.floor(Math.random() * roster.length)].id,
  )
  const [hasPickedCharacter, setHasPickedCharacter] = useState(false)
  const [isPickConfirming, setIsPickConfirming] = useState(false)
  const [pickPhrase, setPickPhrase] = useState<BuddyPhrase | null>(null)
  const character = useMemo(() => getCharacter(characterId), [characterId])
  const backgroundColor = DEFAULT_BUDDY_BACKGROUND
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pickConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const touchOnly = useTouchOnlyDevice()
  const steps = useMemo(
    () =>
      touchOnly
        ? ONBOARDING_STEPS.filter((s) => !KEYBOARD_ONLY_STEPS.has(s))
        : ONBOARDING_STEPS,
    [touchOnly],
  )
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const stepPosition = tk(
    "kids-onboarding-step-position",
    "Step ${step} of ${total}. ",
    { step: String(stepIndex + 1), total: String(steps.length) },
  )
  const buddyName = tk(
    character.defaultNameKey,
    character.defaultNameFallback,
  )
  const playerName = playerNameDraft.trim()
  const showBuddy =
    step !== "welcome" &&
    step !== "name" &&
    step !== "avatar" &&
    step !== "pick" &&
    step !== "reading-mode" &&
    step !== "start"
  const narratorLineKeys = STEP_NARRATOR_LINE_KEYS[step]
  const [lastNarratedStep, setLastNarratedStep] =
    useState<OnboardingStep | null>(null)
  const [narrationPaused, setNarrationPaused] = useState(false)
  const pageStyle = {
    background: "linear-gradient(180deg, #C9E6F9 0%, #A5D2F0 100%)",
  } as CSSProperties

  // The intro starts reading out loud by default. The child can pause it here
  // or choose "I'll read it myself" on the reading-mode step. This is the
  // buddy-guided narrator, independent of the book's own read-aloud audio.
  useEffect(() => {
    setReadAloud(true)
  }, [setReadAloud])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  useEffect(() => {
    return () => {
      if (pickConfirmTimeoutRef.current) {
        clearTimeout(pickConfirmTimeoutRef.current)
      }
    }
  }, [])

  // Neutral narrator reads the current step's title then its description once
  // per step entry, while read-aloud is on and not paused — the "I'll read it
  // myself" path (and an explicit pause) stays fully silent.
  useEffect(() => {
    if (!readAloud || narrationPaused || !narratorLineKeys) return
    if (lastNarratedStep === step) return
    setLastNarratedStep(step)
    void playBuddyLineSequence(language, KIDS_NARRATOR_ID, narratorLineKeys)
  }, [language, lastNarratedStep, narratorLineKeys, narrationPaused, readAloud, step])

  const replayNarratorLine = useCallback(() => {
    if (!narratorLineKeys) return
    void playBuddyLineSequence(language, KIDS_NARRATOR_ID, narratorLineKeys)
  }, [language, narratorLineKeys])

  // Bottom-center play/pause toggle for the intro narration.
  const toggleNarration = useCallback(() => {
    setNarrationPaused((paused) => {
      if (paused) {
        replayNarratorLine()
        return false
      }
      stopBuddyLine()
      return true
    })
  }, [replayNarratorLine])

  const goNext = useCallback(() => {
    if (step === "name") setPlayerName(playerName)
    setNavigationDirection("forward")
    setStepIndex((value) => Math.min(value + 1, steps.length - 1))
  }, [playerName, setPlayerName, step, steps.length])

  const confirmPickAndGoNext = useCallback(() => {
    if (!hasPickedCharacter || reduceMotion) {
      goNext()
      return
    }
    if (pickConfirmTimeoutRef.current) return

    setIsPickConfirming(true)
    pickConfirmTimeoutRef.current = setTimeout(() => {
      pickConfirmTimeoutRef.current = null
      setIsPickConfirming(false)
      goNext()
    }, PICK_CONFIRM_DELAY_MS)
  }, [goNext, hasPickedCharacter, reduceMotion])

  const goBack = useCallback(() => {
    setNavigationDirection("back")
    setStepIndex((value) => Math.max(value - 1, 0))
  }, [])

  const selectCharacter = (next: KidsCharacter) => {
    const phrase = pickRandomPhrase(getPickPhrases(next.id), pickPhrase)
    setHasPickedCharacter(true)
    setCharacterId(next.id)
    setPickPhrase(phrase)
    void playBuddyLine(language, next.id, phrase.key)
  }

  const finish = useCallback(() => {
    setBuddy({
      character: character.id,
      backgroundColor,
    })
    setOnboardingDone(true)
  }, [
    backgroundColor,
    character.id,
    setBuddy,
    setOnboardingDone,
  ])

  const goNextOrFinish = useCallback(() => {
    if (step === "start") {
      finish()
      return
    }
    if (step === "pick") {
      confirmPickAndGoNext()
      return
    }
    goNext()
  }, [confirmPickAndGoNext, finish, goNext, step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
      if (isTypingTarget(event.target)) return
      if (
        event.target instanceof Element &&
        event.target.closest("[data-kids-local-arrow-keys]")
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (event.key === "ArrowRight") {
        goNextOrFinish()
        return
      }
      goBack()
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [goBack, goNextOrFinish])

  return (
    <section
      data-testid="kids-onboarding"
      aria-labelledby="kids-onboarding-title"
      className="pointer-events-auto fixed inset-0 z-[60] min-h-dvh overflow-y-auto text-slate-950"
      style={pageStyle}
    >
      <KidsClouds reduceMotion={reduceMotion} />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-2 sm:px-8 lg:px-10">
        <div className="flex min-h-12 items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={tk("kids-onboarding-back", "Back")}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-sky-800 shadow-[0_3px_0_#B7D6EC] ring-2 ring-sky-100 transition-[transform,box-shadow,background-color] hover:bg-sky-50 active:translate-y-[2px] active:shadow-[0_1px_0_#B7D6EC] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              <ArrowLeft className="h-6 w-6" aria-hidden="true" />
            </button>
          ) : (
            <span className="min-h-12 min-w-12" aria-hidden="true" />
          )}

          <span className="min-h-12 min-w-12" aria-hidden="true" />
        </div>

        <div
          key={step}
          data-testid="kids-onboarding-step"
          className={cn(
            "mx-auto flex w-full flex-1 flex-col items-center justify-between gap-3 py-3 text-center",
            WIDE_STEPS.has(step) ? "max-w-[64rem]" : "max-w-[40rem]",
            reduceMotion ? "transition-none" : "animate-kidsBuddyPop",
          )}
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-3">
            <div
              key={`${step}-hero`}
              className={cn("flex w-full justify-center", !reduceMotion && "animate-kidsBuddyPop")}
            >
              {step === "pick" ? (
                hasPickedCharacter ? (
                  <BuddyHero
                    buddyName={buddyName}
                    character={character}
                    reduceMotion={reduceMotion}
                    isCelebrating={isPickConfirming}
                    speech={
                      pickPhrase
                        ? tk(pickPhrase.key, pickPhrase.fallback, {
                            name: buddyName,
                          })
                        : undefined
                    }
                  />
                ) : (
                  <NeutralOnboardingVisual
                    reduceMotion={reduceMotion}
                    isWelcome={false}
                  />
                )
              ) : showBuddy ? (
                <div className="grid aspect-square w-full max-w-44 place-items-center rounded-full bg-white/70">
                  <KidsBuddyImage
                    key={`${character.id}-${STEP_EXPRESSIONS[step] ?? "standing"}`}
                    images={getBuddyImages(character.id)}
                    variant={STEP_EXPRESSIONS[step] ?? "standing"}
                    title={buddyName}
                    animate={!reduceMotion}
                    className="w-[82%]"
                  />
                </div>
              ) : step === "start" ? (
                <StartHero
                  buddyName={buddyName}
                  character={character}
                  reduceMotion={reduceMotion}
                />
              ) : step === "avatar" ? (
                // The avatar builder has its own big preview — no extra hero.
                null
              ) : (
                <NeutralOnboardingVisual
                  reduceMotion={reduceMotion}
                  isWelcome={step === "welcome"}
                />
              )}
            </div>

            <div
              key={`${step}-text`}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-4",
                !reduceMotion &&
                  (navigationDirection === "forward"
                    ? "animate-kidsSlideFromRight"
                    : "animate-kidsSlideFromLeft"),
              )}
              style={!reduceMotion ? { animationDelay: "60ms" } : undefined}
            >
              {step === "welcome" ? (
                <WelcomeStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  reduceMotion={reduceMotion}
                />
              ) : null}
              {step === "pick" ? (
                <BuddyStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  roster={roster}
                  selectedId={hasPickedCharacter ? character.id : null}
                  onSelect={selectCharacter}
                />
              ) : null}
              {step === "name" ? (
                <NameStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  value={playerNameDraft}
                  onChange={setPlayerNameDraft}
                  onNext={goNext}
                />
              ) : null}
              {step === "avatar" ? (
                <AvatarStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  value={avatar}
                  onChange={setAvatar}
                />
              ) : null}
              {step === "reading-mode" ? (
                <ReadingModeStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  readAloud={readAloud}
                  onReadAloudChange={(value) => {
                    setReadAloud(value)
                    // Choosing "Read it to me" clears any earlier pause so the
                    // narrator resumes; "I'll read myself" stops it entirely.
                    setNarrationPaused(false)
                    if (!value) stopBuddyLine()
                  }}
                />
              ) : null}
              {step === "feature-pages" ? (
                <FeaturePagesStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                />
              ) : null}
              {step === "feature-help" ? (
                <FeatureBuddyStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  touchOnly={touchOnly}
                />
              ) : null}
              {step === "feature-abilities" ? (
                <FeatureAbilitiesStep
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  features={appConfig.features}
                />
              ) : null}
              {step === "start" ? (
                <StartStepText
                  headingRef={headingRef}
                  stepPosition={stepPosition}
                  playerName={playerName}
                  buddyName={buddyName}
                />
              ) : null}

              <div className="flex min-h-14 w-full shrink-0 items-start justify-center pb-1 pt-1">
                <OnboardingPrimaryAction
                  step={step}
                  onNext={step === "pick" ? confirmPickAndGoNext : goNext}
                  onFinish={finish}
                />
              </div>
            </div>
          </div>
        </div>

        {readAloud && narratorLineKeys ? (
          <div className="flex w-full shrink-0 items-center justify-center pb-1">
            <NarratorPlayButton
              paused={narrationPaused}
              label={
                narrationPaused
                  ? tk("kids-onboarding-play", "Read this to me")
                  : tk("kids-onboarding-pause", "Pause reading")
              }
              onClick={toggleNarration}
              reduceMotion={reduceMotion}
            />
          </div>
        ) : null}

        <ProgressDots steps={steps} index={stepIndex} />
      </div>
    </section>
  )
}

function KidsClouds({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <Cloud
        className="left-[6%] top-[14%] scale-90 opacity-70"
        driftClassName={!reduceMotion ? "kids-cloud-drift-slow" : undefined}
      />
      <Cloud
        className="right-[10%] top-[26%] scale-[1.15] opacity-50"
        driftClassName={!reduceMotion ? "kids-cloud-drift-wide" : undefined}
      />
      <Cloud
        className="bottom-[18%] left-[14%] scale-110 opacity-40"
        driftClassName={!reduceMotion ? "kids-cloud-drift" : undefined}
      />
      <Cloud
        className="bottom-[10%] right-[6%] scale-75 opacity-60"
        driftClassName={!reduceMotion ? "kids-cloud-drift-slow" : undefined}
      />
    </div>
  )
}

function Cloud({
  className,
  driftClassName,
}: {
  className?: string
  driftClassName?: string
}) {
  return (
    <div className={cn("absolute h-16 w-44", className)}>
      <span className={cn("absolute inset-0 block", driftClassName)}>
        <span className="absolute bottom-0 left-0 h-10 w-44 rounded-full bg-white/50" />
        <span className="absolute bottom-4 left-7 h-12 w-16 rounded-full bg-white/50" />
        <span className="absolute bottom-3 left-20 h-10 w-14 rounded-full bg-white/50" />
      </span>
    </div>
  )
}

function NeutralOnboardingVisual({
  reduceMotion,
  isWelcome = false,
}: {
  reduceMotion: boolean
  isWelcome?: boolean
}) {
  const animateWelcome = isWelcome && !reduceMotion
  return (
    <div
      data-testid="kids-onboarding-neutral-visual"
      className="relative grid aspect-square w-full max-w-44 place-items-center rounded-full bg-white/70"
    >
      <div
        className={cn(
          "absolute h-[70%] w-[70%] rounded-full bg-sky-200/60 blur-2xl",
          !reduceMotion && !isWelcome && "motion-safe:animate-pulse",
          animateWelcome && "animate-kidsBounceIn",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative grid h-[62%] w-[62%] place-items-center overflow-hidden rounded-[2rem] bg-white shadow-[0_6px_0_#C4DFF2]",
          animateWelcome && "animate-kidsBounceIn",
        )}
        style={animateWelcome ? { animationDelay: "60ms" } : undefined}
      >
        <span
          className="text-6xl"
          style={animateWelcome ? { animationDelay: "480ms" } : undefined}
          aria-hidden="true"
        >
          👋
        </span>
        <Sparkles
          className={cn(
            "absolute right-4 top-4 h-7 w-7 text-[#FFB700]",
            animateWelcome && "animate-kidsSparkle",
          )}
          style={animateWelcome ? { animationDelay: "240ms" } : undefined}
          aria-hidden="true"
        />
        <Sparkles
          className={cn(
            "absolute bottom-4 left-4 h-6 w-6 text-sky-400",
            animateWelcome && "animate-kidsSparkle",
          )}
          style={animateWelcome ? { animationDelay: "340ms" } : undefined}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function BuddyHero({
  buddyName,
  character,
  reduceMotion,
  isCelebrating = false,
  speech,
}: {
  buddyName: string
  character: KidsCharacter
  reduceMotion: boolean
  isCelebrating?: boolean
  speech?: string
}) {
  return (
    <div className="relative">
      <div
        data-testid="kids-onboarding-buddy-hero"
        className="grid aspect-square w-56 max-w-full place-items-center rounded-full bg-white/70"
        style={
          {
            animation:
              isCelebrating && !reduceMotion
                ? `kidsWiggle ${PICK_CONFIRM_DELAY_MS}ms ease-out both`
                : undefined,
          } as CSSProperties
        }
      >
        <KidsBuddyImage
          key={character.id}
          images={getBuddyImages(character.id)}
          variant={isCelebrating ? "happy" : "standing"}
          title={buddyName}
          animate={!isCelebrating && !reduceMotion}
          className="w-[82%]"
        />
      </div>
      {speech ? (
        <div
          key={speech}
          data-testid="kids-onboarding-buddy-speech"
          role="status"
          className={cn(
            "absolute -right-2 -top-4 w-max max-w-[min(13rem,38vw)] translate-x-1/2 rounded-2xl bg-white px-4 py-2.5",
            "text-balance text-left text-base font-bold leading-snug text-slate-950",
            "shadow-[0_3px_0_#C4DFF2] ring-2 ring-sky-100",
            "after:absolute after:-bottom-1.5 after:left-4 after:h-4 after:w-4 after:rotate-45 after:rounded-sm after:border-b-2 after:border-r-2 after:border-sky-100 after:bg-white",
            !reduceMotion && "animate-kidsBuddyPop",
          )}
        >
          {speech}
        </div>
      ) : null}
    </div>
  )
}

function StepLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn(STEP_LAYOUT_CLASS, className)}>{children}</div>
}

function StepTitle({
  headingRef,
  stepPosition,
  children,
  className,
  style,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <h1
      id="kids-onboarding-title"
      ref={headingRef}
      tabIndex={-1}
      className={cn(STEP_TITLE_CLASS, className)}
      style={style}
    >
      <span className="sr-only">{stepPosition}</span>
      {children}
    </h1>
  )
}

function WelcomeStep({
  headingRef,
  stepPosition,
  reduceMotion,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  reduceMotion: boolean
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <div className={STEP_TEXT_STACK_CLASS}>
        <StepTitle
          headingRef={headingRef}
          stepPosition={stepPosition}
          className={cn(
            "max-w-2xl",
            !reduceMotion && "animate-kidsFadeUp",
          )}
          style={!reduceMotion ? { animationDelay: "160ms" } : undefined}
        >
          {tk(
            "kids-onboarding-welcome-title",
            "Hi! Welcome to your reading adventure.",
          )}
        </StepTitle>
        <p
          className={cn(
            STEP_COPY_CLASS,
            !reduceMotion && "animate-kidsFadeUp",
          )}
          style={!reduceMotion ? { animationDelay: "240ms" } : undefined}
        >
          {tk(
            "kids-onboarding-welcome-copy",
            "I'm going to be your reading buddy - first, let's get to know you.",
          )}
        </p>
      </div>
      <p
        className={cn(
          "flex flex-wrap items-center justify-center gap-3 text-base font-semibold text-slate-600",
          !reduceMotion && "animate-kidsFadeUp",
        )}
        style={!reduceMotion ? { animationDelay: "340ms" } : undefined}
      >
        <span>{tk("kids-onboarding-arrow-hint", "Press")}</span>
        <Keycap>→</Keycap>
        <span>{tk("kids-onboarding-arrow-hint-end", "to continue")}</span>
      </p>
    </StepLayout>
  )
}

function NameStep({
  headingRef,
  stepPosition,
  value,
  onChange,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  value: string
  onChange: (value: string) => void
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <label className="flex w-full max-w-xl flex-col items-center gap-4">
        <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
          {tk("kids-onboarding-name-title", "What should I call you?")}
        </StepTitle>
        <input
          data-testid="kids-onboarding-player-name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onNext()
          }}
          className="min-h-16 w-full rounded-2xl border-2 border-sky-200 bg-white px-5 text-center text-2xl font-bold text-slate-950 shadow-[0_4px_0_#C4DFF2] outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          autoComplete="given-name"
        />
      </label>
    </StepLayout>
  )
}

function BuddyStep({
  headingRef,
  stepPosition,
  roster,
  selectedId,
  onSelect,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  roster: readonly KidsCharacter[]
  selectedId: string | null
  onSelect: (character: KidsCharacter) => void
}) {
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
        {tk("kids-onboarding-buddy-title", "Pick a reading buddy")}
      </StepTitle>

      <div className="flex w-full flex-wrap justify-center gap-2.5">
        {roster.map((character, index) => {
          const name = tk(character.defaultNameKey, character.defaultNameFallback)
          const selected = character.id === selectedId
          return (
            <button
              key={character.id}
              type="button"
              data-testid={`kids-onboarding-character-${character.id}`}
              aria-pressed={selected}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(character)}
              className={cn(
                "relative flex min-h-[6.5rem] w-[9.5rem] max-w-[calc(50%-0.375rem)] flex-col items-center justify-between gap-1.5 rounded-2xl border-[3px] bg-white p-2.5 text-center shadow-[0_4px_0_#C4DFF2] transition-[transform,box-shadow,border-color,background-color] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
                selected
                  ? "border-sky-600 bg-sky-50"
                  : "border-slate-200",
                !reduceMotion &&
                  "animate-kidsRiseIn hover:-translate-y-0.5 hover:shadow-[0_5px_0_#C4DFF2] active:translate-y-1 active:shadow-[0_1px_0_#C4DFF2]",
              )}
              style={
                !reduceMotion
                  ? animationDelayStyle(index)
                  : undefined
              }
            >
              {selected ? (
                <span
                  className={cn(
                    "absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-sky-600 text-white ring-[3px] ring-white",
                    !reduceMotion && "animate-kidsBuddyPop",
                  )}
                  aria-hidden="true"
                >
                  <Check className="h-5 w-5" strokeWidth={3.5} />
                </span>
              ) : null}
              <span className="grid aspect-square w-16 place-items-center rounded-2xl bg-sky-50">
                <KidsBuddyImage
                  images={getBuddyImages(character.id)}
                  variant="standing"
                  className="w-12 h-12"
                />
              </span>
              <span className="text-sm font-bold text-slate-950">{name}</span>
            </button>
          )
        })}
      </div>

    </div>
  )
}

function ReadingModeStep({
  headingRef,
  stepPosition,
  readAloud,
  onReadAloudChange,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  readAloud: boolean
  onReadAloudChange: (value: boolean) => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
        {tk("kids-onboarding-read-title", "How do you want to read?")}
      </StepTitle>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <ReadingChoice
          selected={!readAloud}
          icon="👀"
          label={tk("kids-onboarding-read-self", "I'll read it myself")}
          onClick={() => onReadAloudChange(false)}
        />
        <ReadingChoice
          selected={readAloud}
          icon="🔊"
          label={tk("kids-onboarding-read-aloud", "Read it to me")}
          onClick={() => onReadAloudChange(true)}
        />
      </div>
    </StepLayout>
  )
}

function AvatarStep({
  headingRef,
  stepPosition,
  value,
  onChange,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  value: KidsAvatarConfig
  onChange: (next: KidsAvatarConfig) => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
        {tk("kids-onboarding-avatar-title", "Make your character")}
      </StepTitle>
      <KidsAvatarBuilder value={value} onChange={onChange} dense />
    </StepLayout>
  )
}

function FeaturePagesStep({
  headingRef,
  stepPosition,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <div className={STEP_TEXT_STACK_CLASS}>
        <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
          {tk("kids-onboarding-pages-title", "Turn the pages")}
        </StepTitle>
        <p className={STEP_COPY_CLASS}>
          {tk(
            "kids-onboarding-pages-copy",
            "Press the arrow keys to go forward and back.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <Keycap>←</Keycap>
        <Keycap>→</Keycap>
      </div>
    </StepLayout>
  )
}

function FeatureBuddyStep({
  headingRef,
  stepPosition,
  touchOnly,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  touchOnly: boolean
}) {
  const { tk } = useKidsTranslation()
  return (
    <StepLayout>
      <div className={STEP_TEXT_STACK_CLASS}>
        <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
          {tk("kids-onboarding-help-title", "Ask me anytime")}
        </StepTitle>
        <p className={STEP_COPY_CLASS}>
          {touchOnly
            ? tk(
                "kids-onboarding-help-copy-touch",
                "Tap your buddy whenever you want help.",
              )
            : tk(
                "kids-onboarding-help-copy",
                "Tap your buddy or press the L key when you want help.",
              )}
        </p>
      </div>
      {touchOnly ? null : <Keycap>L</Keycap>}
    </StepLayout>
  )
}

interface AbilityItem {
  key: string
  Icon: LucideIcon
  label: string
  description: string
  chip: string
}

function FeatureAbilitiesStep({
  headingRef,
  stepPosition,
  features,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  features: AppFeatures
}) {
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()
  const abilities: AbilityItem[] = [
    ...(features.readAloud
      ? [
          {
            key: "read-aloud",
            chip: "bg-sky-100 text-sky-700",
            Icon: Volume2,
            label: tk("kids-onboarding-ability-read-label", "Read to me"),
            description: tk(
              "kids-onboarding-ability-read-description",
              "I can read the book out loud.",
            ),
          },
          {
            key: "speed",
            chip: "bg-emerald-100 text-emerald-700",
            Icon: Gauge,
            label: tk("kids-onboarding-ability-speed-label", "Reading speed"),
            description: tk(
              "kids-onboarding-ability-speed-description",
              "I can read faster or slower - like a turtle or a rabbit.",
            ),
          },
        ]
      : []),
    ...(features.easyRead
      ? [
          {
            key: "easy-read",
            chip: "bg-violet-100 text-violet-700",
            Icon: TextQuote,
            label: tk("kids-onboarding-ability-easy-read-label", "Easy read"),
            description: tk(
              "kids-onboarding-ability-easy-read-description",
              "I can tell the story with easier words.",
            ),
          },
        ]
      : []),
    ...(features.glossary
      ? [
          {
            key: "glossary",
            chip: "bg-amber-100 text-amber-700",
            Icon: BookOpen,
            label: tk(
              "kids-onboarding-ability-glossary-label",
              "Word helper",
            ),
            description: tk(
              "kids-onboarding-ability-glossary-description",
              "I can explain tricky words.",
            ),
          },
        ]
      : []),
    ...(features.eli5
      ? [
          {
            key: "eli5",
            chip: "bg-pink-100 text-pink-700",
            Icon: Sparkles,
            label: tk("kids-onboarding-ability-eli5-label", "Explain it"),
            description: tk(
              "kids-onboarding-ability-eli5-description",
              "I can explain a page in an easier way.",
            ),
          },
        ]
      : []),
    {
      key: "story-map",
      chip: "bg-teal-100 text-teal-700",
      Icon: Map,
      label: tk("kids-onboarding-ability-story-map-label", "Story map"),
      description: tk(
        "kids-onboarding-ability-story-map-description",
        "I can show you all the parts of the book.",
      ),
    },
  ]

  return (
    <div className="flex min-h-0 w-full flex-col items-center justify-center gap-3">
      <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
        {tk("kids-onboarding-abilities-title", "Here's what I can do")}
      </StepTitle>

      <div
        className={cn(
          "grid max-h-[min(62vh,34rem)] w-full grid-cols-1 gap-2.5 overflow-y-auto px-1.5 py-1 sm:grid-cols-2",
          KIDS_SCROLLBAR_CLASS,
          "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
        )}
        role="region"
        aria-label={tk(
          "kids-onboarding-abilities-region",
          "What your buddy can do",
        )}
        tabIndex={0}
      >
        {abilities.map(({ key, Icon, label, description, chip }, index) => (
          <div
            key={key}
            className={cn(
              "flex items-start gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100",
              !reduceMotion && "animate-kidsRiseIn",
            )}
            style={
              !reduceMotion
                ? animationDelayStyle(index)
                : undefined
            }
          >
            <span
              className={cn(
                "grid h-10 w-10 flex-none place-items-center rounded-2xl",
                chip,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-base font-bold leading-tight text-slate-950">
                {label}
              </span>
              <span className="text-sm font-medium leading-relaxed text-slate-700">
                {description}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StartHero({
  buddyName,
  character,
  reduceMotion,
}: {
  buddyName: string
  character: KidsCharacter
  reduceMotion: boolean
}) {
  return (
    <div className="relative grid aspect-square w-full max-w-64 place-items-center">
      <div
        className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(255,200,0,0.24)_0%,rgba(255,255,255,0)_68%)]"
        aria-hidden="true"
      />
      <div className="relative z-10 grid aspect-square w-[74%] place-items-center rounded-full bg-white/90 shadow-[0_8px_0_#C4DFF2] ring-4 ring-white">
        <KidsBuddyImage
          images={getBuddyImages(character.id)}
          variant="happy"
          title={buddyName}
          animate={!reduceMotion}
          className="w-[88%]"
        />
      </div>
      <div className="absolute bottom-1 z-20 rounded-full bg-[#FFC800] px-5 py-2 text-lg font-black text-slate-950 shadow-[0_4px_0_#DFA000] ring-4 ring-white">
        {buddyName}
      </div>
    </div>
  )
}

function StartStepText({
  headingRef,
  stepPosition,
  playerName,
  buddyName,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  stepPosition: string
  playerName: string
  buddyName: string
}) {
  const { tk } = useKidsTranslation()
  const name = playerName || buddyName
  return (
    <div className="flex flex-col items-center gap-2">
      <StepTitle headingRef={headingRef} stepPosition={stepPosition}>
        {tk("kids-onboarding-start-title", "Ready to read, ${name}?", {
          name,
        })}
      </StepTitle>
      <p className={STEP_COPY_CLASS}>
        {tk(
          "kids-onboarding-start-celebrate",
          "${buddy} is so excited to read with you!",
          { buddy: buddyName },
        )}
      </p>
    </div>
  )
}

function ReadingChoice({
  selected,
  icon,
  label,
  onClick,
}: {
  selected: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  const reduceMotion = usePrefersReducedMotion()
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-40 flex-col items-start justify-between gap-4 rounded-2xl border-[3px] p-5 text-left text-xl font-bold transition-[transform,box-shadow,background-color,border-color] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700 sm:text-2xl",
        selected
          ? "border-sky-800 bg-sky-600 text-white shadow-[0_4px_0_#075985]"
          : "border-slate-300 bg-white text-slate-950 shadow-[0_4px_0_#C4DFF2]",
        !reduceMotion &&
          (selected
            ? "hover:-translate-y-0.5 hover:shadow-[0_5px_0_#075985] active:translate-y-1 active:shadow-[0_1px_0_#075985]"
            : "hover:-translate-y-0.5 hover:shadow-[0_5px_0_#C4DFF2] active:translate-y-1 active:shadow-[0_1px_0_#C4DFF2]"),
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="text-4xl" aria-hidden="true">
          {icon}
        </span>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full transition-colors",
            selected ? "bg-white text-sky-600" : "bg-slate-100 text-transparent",
            selected && !reduceMotion && "animate-kidsBuddyPop",
          )}
          aria-hidden="true"
        >
          <Check className="h-5 w-5" strokeWidth={3.5} />
        </span>
      </span>
      <span>{label}</span>
    </button>
  )
}

function OnboardingPrimaryAction({
  step,
  onNext,
  onFinish,
}: {
  step: OnboardingStep
  onNext: () => void
  onFinish: () => void
}) {
  const { tk } = useKidsTranslation()

  if (step === "start") {
    return (
      <PrimaryButton
        onClick={onFinish}
        testId="kids-onboarding-finish"
        size="lg"
        attention
      >
        <Check className="h-6 w-6" aria-hidden="true" />
        {tk("kids-onboarding-start-reading", "Start reading!")}
      </PrimaryButton>
    )
  }

  const label =
    step === "welcome"
      ? tk("kids-onboarding-lets-go", "Let's go!")
      : step === "name"
        ? tk("kids-onboarding-thats-me", "That's me!")
        : step === "avatar"
          ? tk("kids-onboarding-avatar-continue", "This is me!")
          : step === "pick"
            ? tk("kids-onboarding-buddy-continue", "This is my buddy")
            : step === "reading-mode"
              ? tk("kids-onboarding-read-continue", "Keep going")
                  : tk("kids-onboarding-feature-continue", "Got it")

  return <PrimaryButton onClick={onNext}>{label}</PrimaryButton>
}

function PrimaryButton({
  children,
  onClick,
  testId,
  size = "md",
  attention = false,
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
  size?: "md" | "lg"
  attention?: boolean
}) {
  const reduceMotion = usePrefersReducedMotion()
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#FFC800] font-extrabold text-slate-900 shadow-[0_6px_0_#DFA000] transition-[transform,box-shadow] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
        size === "lg"
          ? "min-h-16 min-w-72 px-10 py-4 text-xl sm:text-2xl"
          : "min-h-14 min-w-64 px-8 py-3 text-lg sm:text-xl",
        reduceMotion
          ? "active:shadow-[0_6px_0_#DFA000]"
          : "hover:-translate-y-[1px] hover:shadow-[0_7px_0_#DFA000] active:translate-y-[6px] active:shadow-[0_1px_0_#DFA000]",
        attention && !reduceMotion && "animate-kidsAttentionNudge",
      )}
    >
      {children}
    </button>
  )
}

function NarratorPlayButton({
  paused,
  label,
  onClick,
  reduceMotion,
}: {
  paused: boolean
  label: string
  onClick: () => void
  reduceMotion: boolean
}) {
  return (
    <button
      type="button"
      data-testid="kids-onboarding-narrator-play"
      aria-pressed={!paused}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-[#FFC800] text-slate-900 shadow-[0_3px_0_#DFA000] ring-2 ring-white transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
        !reduceMotion &&
          "hover:-translate-y-[1px] hover:shadow-[0_4px_0_#DFA000] active:translate-y-[2px] active:shadow-[0_1px_0_#DFA000]",
      )}
    >
      {paused ? (
        <Play className="h-6 w-6" fill="currentColor" aria-hidden="true" />
      ) : (
        <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" />
      )}
    </button>
  )
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd
      data-testid="kids-onboarding-keycap"
      className="inline-flex h-14 w-14 flex-none items-center justify-center rounded-xl border-2 border-sky-100 bg-white text-2xl font-extrabold leading-none text-sky-900 shadow-[0_4px_0_#C4DFF2]"
    >
      {children}
    </kbd>
  )
}

function ProgressDots({
  steps,
  index,
}: {
  steps: OnboardingStep[]
  index: number
}) {
  return (
    <div
      data-testid="kids-onboarding-progress-dots"
      className="flex min-h-12 items-center justify-center gap-2 pb-1"
      aria-hidden="true"
    >
      {steps.map((step, stepIndex) => (
        <span key={step} className="grid h-3 w-7 place-items-center">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full bg-white/80 ring-1 ring-sky-200 transition",
              stepIndex === index && "w-7 bg-sky-600 ring-sky-600",
            )}
          />
        </span>
      ))}
    </div>
  )
}
