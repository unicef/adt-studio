import { ArrowLeft, Check, Sparkles } from "lucide-react"
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
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import { KidsBuddyArt } from "@/features/kids/components/KidsBuddyArt"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import {
  BUDDY_BACKGROUNDS,
  KIDS_CHARACTERS,
  getCharacter,
  getPalette,
  type KidsCharacter,
} from "@/features/kids/lib/characters"
import {
  kidsBuddyAtom,
  kidsOnboardingDoneAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { buddyPaletteVars } from "@/features/kids/assets/buddies/buddy-art"
import { isTypingTarget } from "@/features/navigation/lib/typing-target"
import { cn } from "@/shared/lib/utils"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

type OnboardingStep =
  | "welcome"
  | "buddy"
  | "name"
  | "reading-mode"
  | "feature-pages"
  | "feature-buddy"
  | "start"

const READ_ALOUD_STEPS: OnboardingStep[] = [
  "welcome",
  "buddy",
  "name",
  "reading-mode",
  "feature-pages",
  "feature-buddy",
  "start",
]

const NO_READ_ALOUD_STEPS: OnboardingStep[] = [
  "welcome",
  "buddy",
  "name",
  "feature-pages",
  "feature-buddy",
  "start",
]

const BACKGROUND_LABELS: Record<string, string> = {
  sunbeam: "Sunbeam",
  sky: "Sky",
  mint: "Mint",
  lavender: "Lavender",
  peach: "Peach",
  rose: "Rose",
}

export function KidsOnboarding() {
  const { tk } = useKidsTranslation()
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const appConfig = useAtomValue(appConfigAtom)
  const currentBuddy = useAtomValue(kidsBuddyAtom)
  const currentPlayerName = useAtomValue(kidsPlayerNameAtom)
  const setPlayerName = useSetAtom(kidsPlayerNameAtom)
  const setBuddy = useSetAtom(kidsBuddyAtom)
  const setOnboardingDone = useSetAtom(kidsOnboardingDoneAtom)
  const [readAloud, setReadAloud] = useAtom(readAloudModeAtom)
  const [stepIndex, setStepIndex] = useState(0)
  const [playerNameDraft, setPlayerNameDraft] = useState(currentPlayerName)
  const [characterId, setCharacterId] = useState(currentBuddy.character)
  const character = useMemo(() => getCharacter(characterId), [characterId])
  const defaultBuddyName = tk(
    character.defaultNameKey,
    character.defaultNameFallback,
  )
  const [paletteId, setPaletteId] = useState(
    getPalette(character.art, currentBuddy.palette).id,
  )
  const [backgroundColor, setBackgroundColor] = useState(
    currentBuddy.backgroundColor || BUDDY_BACKGROUNDS[0].value,
  )
  const [buddyNameDraft, setBuddyNameDraft] = useState(
    currentBuddy.name.trim() || defaultBuddyName,
  )
  const headingRef = useRef<HTMLHeadingElement>(null)
  const steps = appConfig.features.readAloud
    ? READ_ALOUD_STEPS
    : NO_READ_ALOUD_STEPS
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const palette = getPalette(character.art, paletteId)
  const buddyName = buddyNameDraft.trim() || defaultBuddyName
  const playerName = playerNameDraft.trim()
  const pageStyle = {
    "--kids-onboarding-accent": backgroundColor,
    background: `linear-gradient(180deg, #ECFEFF 0%, ${backgroundColor} 56%, #FDF2F8 100%)`,
  } as CSSProperties

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const goNext = useCallback(() => {
    if (step === "name") setPlayerName(playerName)
    setStepIndex((value) => Math.min(value + 1, steps.length - 1))
  }, [playerName, setPlayerName, step, steps.length])

  const goBack = useCallback(() => {
    setStepIndex((value) => Math.max(value - 1, 0))
  }, [])

  const selectCharacter = (next: KidsCharacter) => {
    const nextDefaultName = tk(next.defaultNameKey, next.defaultNameFallback)
    setCharacterId(next.id)
    setPaletteId(next.art.palettes[0].id)
    setBuddyNameDraft(nextDefaultName)
  }

  const finish = useCallback(() => {
    setBuddy({
      character: character.id,
      palette: palette.id,
      backgroundColor,
      name: buddyName,
    })
    setOnboardingDone(true)
  }, [
    backgroundColor,
    buddyName,
    character.id,
    palette.id,
    setBuddy,
    setOnboardingDone,
  ])

  const goNextOrFinish = useCallback(() => {
    if (step === "start") {
      finish()
      return
    }
    goNext()
  }, [finish, goNext, step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
      if (isTypingTarget(event.target)) return

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
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex min-h-16 items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={tk("kids-onboarding-back", "Back")}
              className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm ring-2 ring-slate-200 transition hover:bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            >
              <ArrowLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : (
            <span className="min-h-14 min-w-14" aria-hidden="true" />
          )}
        </div>

        <div
          key={step}
          data-testid="kids-onboarding-step"
          className={cn(
            "grid flex-1 items-center gap-8 py-4 lg:grid-cols-[minmax(16rem,24rem)_1fr] lg:gap-12",
            reduceMotion
              ? "transition-none"
              : "transition-all duration-300 ease-out motion-safe:animate-kidsBuddyPop",
          )}
        >
          <aside className="flex flex-col items-center justify-center gap-5">
            <div
              className="grid aspect-square w-full max-w-80 place-items-center rounded-[2rem] shadow-inner ring-8 ring-white/65"
              style={
                {
                  backgroundColor,
                  ...buddyPaletteVars(palette),
                } as CSSProperties
              }
            >
              <KidsBuddyArt
                art={character.art}
                palette={palette}
                title={buddyName}
                className={cn(
                  "block w-[78%]",
                  !reduceMotion && "kids-buddy-idle",
                )}
              />
            </div>
          </aside>

          <div className="flex min-h-[32rem] flex-col justify-center gap-5">
            {step === "welcome" ? (
              <WelcomeStep
                headingRef={headingRef}
                onNext={goNext}
              />
            ) : null}
            {step === "buddy" ? (
              <BuddyStep
                headingRef={headingRef}
                selectedId={character.id}
                character={character}
                paletteId={palette.id}
                backgroundColor={backgroundColor}
                buddyName={buddyNameDraft}
                onSelect={selectCharacter}
                onPaletteChange={setPaletteId}
                onBackgroundChange={setBackgroundColor}
                onNameChange={setBuddyNameDraft}
                onNext={goNext}
              />
            ) : null}
            {step === "name" ? (
              <NameStep
                headingRef={headingRef}
                value={playerNameDraft}
                onChange={setPlayerNameDraft}
                onNext={goNext}
              />
            ) : null}
            {step === "reading-mode" ? (
              <ReadingModeStep
                headingRef={headingRef}
                readAloud={readAloud}
                onReadAloudChange={setReadAloud}
                onNext={goNext}
              />
            ) : null}
            {step === "feature-pages" ? (
              <FeaturePagesStep headingRef={headingRef} onNext={goNext} />
            ) : null}
            {step === "feature-buddy" ? (
              <FeatureBuddyStep headingRef={headingRef} onNext={goNext} />
            ) : null}
            {step === "start" ? (
              <StartStep
                headingRef={headingRef}
                playerName={playerName}
                buddyName={buddyName}
                onFinish={finish}
              />
            ) : null}
          </div>
        </div>

        <ProgressDots steps={steps} index={stepIndex} />
      </div>
    </section>
  )
}

function WelcomeStep({
  headingRef,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-welcome-title", "Hi! I'm your reading buddy.")}
        </h1>
        <p className="max-w-2xl text-balance text-2xl font-bold leading-snug text-slate-700">
          {tk(
            "kids-onboarding-welcome-copy",
            "Come with me and I will show you how this book works.",
          )}
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-3 text-lg font-black text-slate-700">
        <span>{tk("kids-onboarding-arrow-hint", "Press")}</span>
        <Keycap>→</Keycap>
        <span>{tk("kids-onboarding-arrow-hint-end", "to continue")}</span>
      </p>
      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-lets-go", "Let's go!")}
      </PrimaryButton>
    </div>
  )
}

function NameStep({
  headingRef,
  value,
  onChange,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  value: string
  onChange: (value: string) => void
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <label className="flex flex-col gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-name-title", "What is your name?")}
        </h1>
        <input
          data-testid="kids-onboarding-player-name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onNext()
          }}
          className="min-h-16 rounded-3xl border-4 border-sky-200 bg-white px-5 text-2xl font-black text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-200"
          autoComplete="given-name"
        />
      </label>
      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-thats-me", "That's me!")}
      </PrimaryButton>
    </div>
  )
}

function BuddyStep({
  headingRef,
  selectedId,
  character,
  paletteId,
  backgroundColor,
  buddyName,
  onSelect,
  onPaletteChange,
  onBackgroundChange,
  onNameChange,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  selectedId: string
  character: KidsCharacter
  paletteId: string
  backgroundColor: string
  buddyName: string
  onSelect: (character: KidsCharacter) => void
  onPaletteChange: (value: string) => void
  onBackgroundChange: (value: string) => void
  onNameChange: (value: string) => void
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  const selected = getCharacter(selectedId)
  const selectedName = tk(
    selected.defaultNameKey,
    selected.defaultNameFallback,
  )
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-buddy-title", "Pick a reading buddy")}
        </h1>
        <p className="text-balance text-xl font-bold text-slate-700">
          {tk("kids-onboarding-buddy-hi", "Hi! I am ${name}.", {
            name: selectedName,
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {KIDS_CHARACTERS.map((character) => {
          const name = tk(character.defaultNameKey, character.defaultNameFallback)
          const label = tk(character.labelKey, character.labelFallback)
          const palette = getPalette(character.art)
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
                "flex min-h-44 flex-col items-center justify-between gap-2 rounded-3xl bg-white p-3 text-center shadow-sm ring-4 ring-transparent transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
                selected && "bg-sky-50 ring-sky-500",
              )}
            >
              <span className="grid aspect-square w-24 place-items-center rounded-3xl bg-amber-100">
                <KidsBuddyArt
                  art={character.art}
                  palette={palette}
                  title={name}
                  className="block w-20"
                />
              </span>
              <span className="text-lg font-black text-slate-950">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-5 rounded-[2rem] bg-white/65 p-4 shadow-sm ring-2 ring-white/75 lg:grid-cols-2">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xl font-black text-slate-900">
            {tk("kids-onboarding-palette-title", "Colors")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {character.art.palettes.map((palette) => {
              const selected = palette.id === paletteId
              return (
                <button
                  key={palette.id}
                  type="button"
                  data-testid={`kids-onboarding-palette-${palette.id}`}
                  aria-pressed={selected}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onPaletteChange(palette.id)}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left text-lg font-black text-slate-950 shadow-sm ring-4 ring-transparent transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
                    selected && "ring-sky-500",
                  )}
                >
                  <Swatches colors={[palette.primary, palette.secondary, palette.accent]} />
                  <span>{tk(palette.labelKey, palette.labelFallback)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xl font-black text-slate-900">
              {tk("kids-onboarding-background-title", "Background")}
            </legend>
            <div className="flex flex-wrap gap-3">
              {BUDDY_BACKGROUNDS.map((background) => {
                const selected = background.value === backgroundColor
                return (
                  <button
                    key={background.id}
                    type="button"
                    data-testid={`kids-onboarding-background-${background.id}`}
                    aria-label={tk(
                      `kids-background-${background.id}`,
                      BACKGROUND_LABELS[background.id] ?? background.id,
                    )}
                    aria-pressed={selected}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onBackgroundChange(background.value)}
                    className={cn(
                      "min-h-14 min-w-14 rounded-full shadow-sm ring-4 ring-white transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
                      selected && "ring-sky-600",
                    )}
                    style={{ backgroundColor: background.value }}
                  />
                )
              })}
            </div>
          </fieldset>

          <label className="flex flex-col gap-3">
            <span className="text-xl font-black text-slate-900">
              {tk("kids-onboarding-rename-title", "Buddy name")}
            </span>
            <input
              data-testid="kids-onboarding-buddy-name"
              value={buddyName}
              onChange={(event) => onNameChange(event.target.value)}
              className="min-h-14 rounded-3xl border-4 border-sky-200 bg-white px-5 text-2xl font-black text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-200"
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-buddy-continue", "This is my buddy")}
      </PrimaryButton>
    </div>
  )
}

function ReadingModeStep({
  headingRef,
  readAloud,
  onReadAloudChange,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  readAloud: boolean
  onReadAloudChange: (value: boolean) => void
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1
        id="kids-onboarding-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
      >
        {tk("kids-onboarding-read-title", "How do you want to read?")}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2">
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

      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-read-continue", "Keep going")}
      </PrimaryButton>
    </div>
  )
}

function FeaturePagesStep({
  headingRef,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-pages-title", "Turn the pages")}
        </h1>
        <p className="max-w-2xl text-balance text-2xl font-bold leading-snug text-slate-700">
          {tk(
            "kids-onboarding-pages-copy",
            "Press the arrow keys to go forward and back.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Keycap>←</Keycap>
        <Keycap>→</Keycap>
      </div>
      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-feature-continue", "Got it")}
      </PrimaryButton>
    </div>
  )
}

function FeatureBuddyStep({
  headingRef,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-help-title", "Ask me anytime")}
        </h1>
        <p className="max-w-3xl text-balance text-2xl font-bold leading-snug text-slate-700">
          {tk(
            "kids-onboarding-help-copy",
            "Tap your buddy or press the L key. I can read to you, make letters bigger, explain hard words, show the story map, and more.",
          )}
        </p>
      </div>
      <Keycap>L</Keycap>
      <PrimaryButton onClick={onNext}>
        {tk("kids-onboarding-feature-continue", "Got it")}
      </PrimaryButton>
    </div>
  )
}

function StartStep({
  headingRef,
  playerName,
  buddyName,
  onFinish,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  playerName: string
  buddyName: string
  onFinish: () => void
}) {
  const { tk } = useKidsTranslation()
  const name = playerName || buddyName
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="flex flex-col gap-3">
        <Sparkles className="h-14 w-14 text-amber-500" aria-hidden="true" />
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-black leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-start-title", "Ready to read, ${name}?", {
            name,
          })}
        </h1>
        <p className="text-balance text-2xl font-bold text-slate-700">
          {tk(
            "kids-onboarding-done-copy",
            "${buddy} is ready to read with you.",
            { buddy: buddyName },
          )}
        </p>
      </div>
      <PrimaryButton onClick={onFinish} testId="kids-onboarding-finish">
        <Check className="h-6 w-6" aria-hidden="true" />
        {tk("kids-onboarding-start-reading", "Start reading!")}
      </PrimaryButton>
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
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-40 flex-col items-start justify-between gap-4 rounded-[2rem] bg-white/85 p-5 text-left text-2xl font-black text-slate-950 shadow-sm ring-4 ring-transparent transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        selected && "ring-sky-500",
      )}
    >
      <span className="text-5xl" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function PrimaryButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex min-h-14 w-fit min-w-48 items-center justify-center gap-2 rounded-full bg-sky-600 px-7 py-3 text-xl font-black text-white shadow-lg shadow-sky-900/20 transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
    >
      {children}
    </button>
  )
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd
      data-testid="kids-onboarding-keycap"
      className="inline-flex h-14 w-14 flex-none items-center justify-center self-start rounded-2xl border-2 border-slate-300 bg-white text-3xl font-black leading-none text-slate-900 shadow-[0_5px_0_rgba(15,23,42,0.16)]"
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
        <span
          key={step}
          className={cn(
            "h-3 w-3 rounded-full bg-slate-300 transition",
            stepIndex === index && "w-8 bg-sky-600",
          )}
        />
      ))}
    </div>
  )
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="flex overflow-hidden rounded-full ring-2 ring-white">
      {colors.map((color) => (
        <span
          key={color}
          className="h-8 w-8"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}
