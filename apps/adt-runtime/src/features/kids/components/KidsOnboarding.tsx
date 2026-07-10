import {
  ArrowLeft,
  BookOpen,
  CaseSensitive,
  Check,
  Gauge,
  Map,
  Sparkles,
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
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import { KidsBuddyArt } from "@/features/kids/components/KidsBuddyArt"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import {
  BUDDY_BACKGROUNDS,
  KIDS_CHARACTERS,
  getCharacter,
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
import { appConfigAtom, type AppFeatures } from "@/shared/state/config.atoms"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

type OnboardingStep =
  | "welcome"
  | "name"
  | "pick"
  | "reading-mode"
  | "feature-pages"
  | "feature-help"
  | "feature-abilities"
  | "start"

const READ_ALOUD_STEPS: OnboardingStep[] = [
  "welcome",
  "name",
  "pick",
  "reading-mode",
  "feature-pages",
  "feature-help",
  "feature-abilities",
  "start",
]

const NO_READ_ALOUD_STEPS: OnboardingStep[] = [
  "welcome",
  "name",
  "pick",
  "feature-pages",
  "feature-help",
  "feature-abilities",
  "start",
]

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
  const palette = character.art.palettes[0]
  const backgroundColor = BUDDY_BACKGROUNDS[0].value
  const defaultBuddyName = tk(
    character.defaultNameKey,
    character.defaultNameFallback,
  )
  const [buddyNameDraft, setBuddyNameDraft] = useState(
    currentBuddy.name.trim() || defaultBuddyName,
  )
  const headingRef = useRef<HTMLHeadingElement>(null)
  const steps = appConfig.features.readAloud
    ? READ_ALOUD_STEPS
    : NO_READ_ALOUD_STEPS
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const buddyName = buddyNameDraft.trim() || defaultBuddyName
  const playerName = playerNameDraft.trim()
  const showBuddy = step !== "welcome" && step !== "name"
  const pageStyle = {
    background: "linear-gradient(180deg, #C9E6F9 0%, #A5D2F0 100%)",
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
      <KidsClouds reduceMotion={reduceMotion} />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex min-h-16 items-center justify-between gap-3">
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
        </div>

        <div
          key={step}
          data-testid="kids-onboarding-step"
          className={cn(
            "mx-auto flex w-full max-w-[40rem] flex-1 flex-col items-center justify-between gap-6 py-6 text-center",
            reduceMotion
              ? "transition-none"
              : "transition-all duration-300 ease-out motion-safe:animate-kidsBuddyPop",
          )}
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-7">
            {showBuddy ? (
              <div
                className="grid aspect-square w-full max-w-56 place-items-center rounded-full bg-white/70"
                style={
                  {
                    ...buddyPaletteVars(palette),
                  } as CSSProperties
                }
              >
                <KidsBuddyArt
                  art={character.art}
                  palette={palette}
                  title={buddyName}
                  className={cn(
                    "block w-[82%]",
                    !reduceMotion && "kids-buddy-idle",
                  )}
                />
              </div>
            ) : (
              <NeutralOnboardingVisual reduceMotion={reduceMotion} />
            )}

            <div className="flex w-full flex-col items-center justify-center gap-5">
              {step === "welcome" ? (
                <WelcomeStep headingRef={headingRef} />
              ) : null}
              {step === "pick" ? (
                <BuddyStep
                  headingRef={headingRef}
                  selectedId={character.id}
                  buddyName={buddyNameDraft}
                  onSelect={selectCharacter}
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
                />
              ) : null}
              {step === "feature-pages" ? (
                <FeaturePagesStep headingRef={headingRef} />
              ) : null}
              {step === "feature-help" ? (
                <FeatureBuddyStep headingRef={headingRef} />
              ) : null}
              {step === "feature-abilities" ? (
                <FeatureAbilitiesStep
                  headingRef={headingRef}
                  features={appConfig.features}
                />
              ) : null}
              {step === "start" ? (
                <StartStep
                  headingRef={headingRef}
                  playerName={playerName}
                  buddyName={buddyName}
                />
              ) : null}
            </div>
          </div>

          <div className="flex min-h-20 w-full shrink-0 items-start justify-center pb-3 pt-1">
            <OnboardingPrimaryAction
              step={step}
              onNext={goNext}
              onFinish={finish}
            />
          </div>
        </div>

        <ProgressDots steps={steps} index={stepIndex} />
      </div>
    </section>
  )
}

function KidsClouds({ reduceMotion }: { reduceMotion: boolean }) {
  const drift = !reduceMotion && "kids-buddy-idle"
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <Cloud className={cn("left-[6%] top-[14%] scale-90 opacity-70", drift)} />
      <Cloud className="right-[10%] top-[26%] scale-[1.15] opacity-50" />
      <Cloud className={cn("bottom-[18%] left-[14%] scale-110 opacity-40", drift)} />
      <Cloud className="bottom-[10%] right-[6%] scale-75 opacity-60" />
    </div>
  )
}

function Cloud({ className }: { className?: string }) {
  return (
    <div className={cn("absolute h-16 w-44", className)}>
      <span className="absolute bottom-0 left-0 h-10 w-44 rounded-full bg-white/50" />
      <span className="absolute bottom-4 left-7 h-12 w-16 rounded-full bg-white/50" />
      <span className="absolute bottom-3 left-20 h-10 w-14 rounded-full bg-white/50" />
    </div>
  )
}

function NeutralOnboardingVisual({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      data-testid="kids-onboarding-neutral-visual"
      className="relative grid aspect-square w-full max-w-56 place-items-center rounded-full bg-white/70"
    >
      <div
        className={cn(
          "absolute h-[70%] w-[70%] rounded-full bg-sky-200/60 blur-2xl",
          !reduceMotion && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />
      <div className="relative grid h-[62%] w-[62%] place-items-center rounded-[2rem] bg-white shadow-[0_6px_0_#C4DFF2]">
        <span
          className={cn("text-7xl", !reduceMotion && "kids-buddy-idle")}
          aria-hidden="true"
        >
          👋
        </span>
        <Sparkles
          className="absolute right-4 top-4 h-7 w-7 text-[#FFB700]"
          aria-hidden="true"
        />
        <Sparkles
          className="absolute bottom-4 left-4 h-6 w-6 text-sky-400"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function WelcomeStep({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="max-w-2xl text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk(
            "kids-onboarding-welcome-title",
            "Hi! Welcome to your reading adventure.",
          )}
        </h1>
        <p className="max-w-xl text-balance text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl">
          {tk(
            "kids-onboarding-welcome-copy",
            "I'm going to be your reading buddy - first, let's get to know you.",
          )}
        </p>
      </div>
      <p className="flex flex-wrap items-center justify-center gap-3 text-base font-semibold text-slate-600">
        <span>{tk("kids-onboarding-arrow-hint", "Press")}</span>
        <Keycap>→</Keycap>
        <span>{tk("kids-onboarding-arrow-hint-end", "to continue")}</span>
      </p>
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
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <label className="flex w-full max-w-xl flex-col items-center gap-4">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-name-title", "What should I call you?")}
        </h1>
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
    </div>
  )
}

function BuddyStep({
  headingRef,
  selectedId,
  buddyName,
  onSelect,
  onNameChange,
  onNext,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  selectedId: string
  buddyName: string
  onSelect: (character: KidsCharacter) => void
  onNameChange: (value: string) => void
  onNext: () => void
}) {
  const { tk } = useKidsTranslation()
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const selected = getCharacter(selectedId)
  const selectedName = tk(
    selected.defaultNameKey,
    selected.defaultNameFallback,
  )
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-buddy-title", "Pick a reading buddy")}
        </h1>
        <p className="text-balance text-lg font-medium leading-relaxed text-slate-700 sm:text-xl">
          {tk("kids-onboarding-buddy-hi", "Hi! I am ${name}.", {
            name: selectedName,
          })}
        </p>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
        {KIDS_CHARACTERS.map((character) => {
          const name = tk(character.defaultNameKey, character.defaultNameFallback)
          const label = tk(character.labelKey, character.labelFallback)
          const palette = character.art.palettes[0]
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
                "relative flex min-h-36 flex-col items-center justify-between gap-2 rounded-2xl border-[3px] bg-white p-3 text-center shadow-[0_4px_0_#C4DFF2] transition-[transform,box-shadow,border-color,background-color] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
                selected
                  ? "border-sky-600 bg-sky-50"
                  : "border-slate-200",
                !reduceMotion &&
                  "hover:-translate-y-0.5 hover:shadow-[0_5px_0_#C4DFF2] active:translate-y-1 active:shadow-[0_1px_0_#C4DFF2]",
              )}
            >
              {selected ? (
                <span
                  className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-sky-500 text-white ring-[3px] ring-white"
                  aria-hidden="true"
                >
                  <Check className="h-5 w-5" strokeWidth={3.5} />
                </span>
              ) : null}
              <span className="grid aspect-square w-20 place-items-center rounded-2xl bg-sky-50">
                <KidsBuddyArt
                  art={character.art}
                  palette={palette}
                  title={name}
                  className="block w-16"
                />
              </span>
              <span className="text-base font-bold text-slate-950">{label}</span>
            </button>
          )
        })}
      </div>

      <label className="flex w-full max-w-xl flex-col gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_4px_0_#C4DFF2] ring-2 ring-sky-100">
        <span className="text-base font-bold text-slate-900">
          {tk("kids-onboarding-rename-title", "Buddy name")}
        </span>
        <input
          data-testid="kids-onboarding-buddy-name"
          value={buddyName}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onNext()
          }}
          className="min-h-14 rounded-2xl border-2 border-sky-200 bg-white px-4 text-xl font-bold text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          autoComplete="off"
        />
      </label>
    </div>
  )
}

function ReadingModeStep({
  headingRef,
  readAloud,
  onReadAloudChange,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  readAloud: boolean
  onReadAloudChange: (value: boolean) => void
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <h1
        id="kids-onboarding-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
      >
        {tk("kids-onboarding-read-title", "How do you want to read?")}
      </h1>

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
    </div>
  )
}

function FeaturePagesStep({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-pages-title", "Turn the pages")}
        </h1>
        <p className="max-w-xl text-balance text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl">
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
    </div>
  )
}

function FeatureBuddyStep({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const { tk } = useKidsTranslation()
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-help-title", "Ask me anytime")}
        </h1>
        <p className="max-w-xl text-balance text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl">
          {tk(
            "kids-onboarding-help-copy",
            "Tap your buddy or press the L key when you want help.",
          )}
        </p>
      </div>
      <Keycap>L</Keycap>
    </div>
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
  features,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  features: AppFeatures
}) {
  const { tk } = useKidsTranslation()
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
            Icon: CaseSensitive,
            label: tk("kids-onboarding-ability-easy-read-label", "Easy read"),
            description: tk(
              "kids-onboarding-ability-easy-read-description",
              "I can make the words simpler and bigger.",
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
    <div className="flex min-h-0 w-full flex-col items-center justify-center gap-5">
      <h1
        id="kids-onboarding-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
      >
        {tk("kids-onboarding-abilities-title", "Here's what I can do")}
      </h1>

      <div className="flex max-h-[min(52vh,28rem)] w-full flex-col gap-3 overflow-y-auto pr-1">
        {abilities.map(({ key, Icon, label, description, chip }) => (
          <div
            key={key}
            className="flex items-start gap-4 rounded-2xl bg-white p-4 text-left shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100"
          >
            <span
              className={cn(
                "grid h-12 w-12 flex-none place-items-center rounded-2xl",
                chip,
              )}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-lg font-bold leading-tight text-slate-950">
                {label}
              </span>
              <span className="text-base font-medium leading-relaxed text-slate-700">
                {description}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StartStep({
  headingRef,
  playerName,
  buddyName,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  playerName: string
  buddyName: string
}) {
  const { tk } = useKidsTranslation()
  const name = playerName || buddyName
  return (
    <div className="flex w-full flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <Sparkles className="h-12 w-12 text-[#FFB700]" aria-hidden="true" />
        <h1
          id="kids-onboarding-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-4xl font-extrabold leading-tight text-slate-950 focus:outline-none sm:text-5xl"
        >
          {tk("kids-onboarding-start-title", "Ready to read, ${name}?", {
            name,
          })}
        </h1>
        <p className="max-w-xl text-balance text-xl font-medium leading-relaxed text-slate-700 sm:text-2xl">
          {tk(
            "kids-onboarding-done-copy",
            "${buddy} is ready to read with you.",
            { buddy: buddyName },
          )}
        </p>
      </div>
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
  const reduceMotion = useAtomValue(reduceMotionAtom)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-40 flex-col items-start justify-between gap-4 rounded-2xl border-[3px] p-5 text-left text-xl font-bold transition-[transform,box-shadow,background-color,border-color] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700 sm:text-2xl",
        selected
          ? "border-sky-700 bg-sky-500 text-white shadow-[0_4px_0_#075985]"
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
      <PrimaryButton onClick={onFinish} testId="kids-onboarding-finish">
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
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}) {
  const reduceMotion = useAtomValue(reduceMotionAtom)
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-14 w-fit min-w-64 items-center justify-center gap-2 rounded-full bg-[#FFC800] px-8 py-3 text-lg font-extrabold text-slate-900 shadow-[0_6px_0_#DFA000] transition-[transform,box-shadow] duration-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:text-xl",
        reduceMotion
          ? "active:shadow-[0_6px_0_#DFA000]"
          : "hover:-translate-y-[1px] hover:shadow-[0_7px_0_#DFA000] active:translate-y-[6px] active:shadow-[0_1px_0_#DFA000]",
      )}
    >
      {children}
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
