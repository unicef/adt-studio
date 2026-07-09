import {
  BookOpen,
  CaseSensitive,
  Check,
  Gauge,
  Hand,
  Languages,
  Map,
  NotebookPen,
  Pause,
  Rabbit,
  Sparkles,
  Turtle,
  Volume2,
  X,
} from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react"
import {
  audioSpeedAtom,
  playBarVisibleAtom,
} from "@/features/audio/state/audio.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
  type TocEntry,
} from "@/features/navigation/state/nav.atoms"
import { navigateToHref } from "@/features/navigation/lib/page-navigation"
import { buddyPaletteVars } from "@/features/kids/assets/buddies/buddy-art"
import { KidsActionButton } from "@/features/kids/components/KidsActionButton"
import { KidsBuddyArt } from "@/features/kids/components/KidsBuddyArt"
import { useBuddySpeech } from "@/features/kids/hooks/useBuddySpeech"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import {
  buddySpeechAtom,
  kidsBuddyPanelOpenAtom,
  kidsBuddyAtom,
  kidsLanguageDialogOpenAtom,
  kidsLastSpotAtom,
  kidsResumeChipDismissedAtom,
  kidsPlayerNameAtom,
  kidsStoryMapDialogOpenAtom,
  type KidsLastSpot,
} from "@/features/kids/state/kids.atoms"
import { getCharacter, getPalette } from "@/features/kids/lib/characters"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { trackToggleEvent } from "@/shared/lib/analytics"
import { cn } from "@/shared/lib/utils"
import {
  easyReadModeAtom,
  eli5ModeAtom,
  eli5PopupOpenAtom,
  glossaryModeAtom,
  notepadOpenAtom,
  reduceMotionAtom,
  signLanguageModeAtom,
} from "@/shared/state/ui.atoms"

const GREETING_SESSION_KEY = "kidsBuddyGreeted"
const RESUME_SESSION_KEY = "kidsLastSpotOfferChecked"
const SPEEDS = [0.75, 1, 1.3] as const

export function KidsBuddy() {
  const { tk } = useKidsTranslation()
  const config = useAtomValue(appConfigAtom)
  const features = config.features
  const buddy = useAtomValue(kidsBuddyAtom)
  const playerName = useAtomValue(kidsPlayerNameAtom).trim()
  const setSpeech = useSetAtom(buddySpeechAtom)
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const { isPlaying, hasItems, togglePlayPause } = useAudioPlayerContext()
  const { say } = useBuddySpeech()
  const [open, setOpen] = useAtom(kidsBuddyPanelOpenAtom)
  const [speed, setSpeed] = useAtom(audioSpeedAtom)
  const setPlayBarVisible = useSetAtom(playBarVisibleAtom)
  const [signLanguage, setSignLanguage] = useAtom(signLanguageModeAtom)
  const [easyRead, setEasyRead] = useAtom(easyReadModeAtom)
  const [glossary, setGlossary] = useAtom(glossaryModeAtom)
  const setEli5Mode = useSetAtom(eli5ModeAtom)
  const setEli5Open = useSetAtom(eli5PopupOpenAtom)
  const setNotepadOpen = useSetAtom(notepadOpenAtom)
  const setLanguageDialogOpen = useSetAtom(kidsLanguageDialogOpenAtom)
  const setStoryMapDialogOpen = useSetAtom(kidsStoryMapDialogOpenAtom)
  const languageCount = config.languages.available.length

  const character = useMemo(
    () => getCharacter(buddy.character),
    [buddy.character],
  )
  const buddyName =
    buddy.name.trim() ||
    tk(character.defaultNameKey, character.defaultNameFallback)
  const palette = getPalette(character.art, buddy.palette)
  const paletteVars = buddyPaletteVars(palette)
  const readLabel = isPlaying
    ? tk("kids-action-pause", "Take a break")
    : tk("kids-action-read", "Read to me")
  const speedState = getSpeedState(speed)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem(GREETING_SESSION_KEY) === "true") return
    window.sessionStorage.setItem(GREETING_SESSION_KEY, "true")
    say(
      playerName
        ? tk(
            "kids-buddy-greet-name",
            "Hi ${name}! Tap me if you need help.",
            { name: playerName },
          )
        : tk("kids-buddy-greet", "Hi! Tap me if you need help."),
    )
  }, [playerName, say, tk])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])

  const handleFabClick = () => {
    if (!open) setSpeech(null)
    setOpen((value) => !value)
  }

  const confirm = (key: string, fallback: string) => say(tk(key, fallback))

  const handleRead = () => {
    setPlayBarVisible(true)
    togglePlayPause()
    confirm(
      isPlaying ? "kids-confirm-read-break" : "kids-confirm-read-start",
      isPlaying ? "Okay, taking a break." : "Okay! I will read with you.",
    )
  }

  const handleSpeed = () => {
    const next = nextSpeed(speed)
    setSpeed(next)
    if (next === 0.75) {
      confirm(
        "kids-confirm-speed-slow",
        "Okay! Now I read slowly, like a turtle.",
      )
    } else if (next === 1.3) {
      confirm(
        "kids-confirm-speed-fast",
        "Okay! Now I read quickly, like a rabbit.",
      )
    } else {
      confirm("kids-confirm-speed-normal", "Okay! Now I read at normal speed.")
    }
  }

  const toggleSignLanguage = () => {
    const next = !signLanguage
    trackToggleEvent("SignLanguage", next)
    setSignLanguage(next)
    confirm(
      next ? "kids-confirm-sign-on" : "kids-confirm-sign-off",
      next ? "Sign language is on!" : "Sign language is off.",
    )
  }

  const toggleEasyRead = () => {
    const next = !easyRead
    trackToggleEvent("EasyRead", next)
    setEasyRead(next)
    confirm(
      next ? "kids-confirm-easy-read-on" : "kids-confirm-easy-read-off",
      next ? "Big letters are on!" : "Big letters are off.",
    )
  }

  const toggleGlossary = () => {
    const next = !glossary
    trackToggleEvent("GlossaryHighlight", next)
    setGlossary(next)
    confirm(
      next ? "kids-confirm-glossary-on" : "kids-confirm-glossary-off",
      next ? "Word helper is on!" : "Word helper is off.",
    )
  }

  const openEli5 = () => {
    setEli5Mode(true)
    setEli5Open(true)
    setOpen(false)
    confirm("kids-confirm-eli5-open", "I opened a simpler explanation.")
  }

  const openNotepad = () => {
    setNotepadOpen(true)
    setOpen(false)
    confirm("kids-confirm-notes-open", "Your notes are open.")
  }

  return (
    <div
      data-testid="kids-buddy"
      className="pointer-events-auto fixed bottom-5 right-5 z-[59] flex flex-col items-end gap-3"
    >
      <KidsResumeChip />
      {open ? (
        <div
          data-testid="kids-buddy-panel"
          className={cn(
            "max-h-[min(72vh,34rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto rounded-[1.75rem] bg-amber-50 p-3 shadow-2xl ring-2 ring-white/90",
            "transition-all duration-200 ease-out",
            !reduceMotion && "motion-safe:animate-kidsBuddyPop",
          )}
        >
          <div className="grid grid-cols-2 gap-2">
            {features.readAloud ? (
              <>
                <KidsActionButton
                  testId="kids-action-read"
                  icon={
                    isPlaying ? (
                      <Pause className="h-5 w-5" fill="currentColor" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )
                  }
                  label={readLabel}
                  onClick={handleRead}
                  disabled={!hasItems}
                  active={isPlaying}
                />
                <KidsActionButton
                  testId="kids-action-speed"
                  icon={speedState.icon}
                  label={speedState.label(tk)}
                  onClick={handleSpeed}
                />
              </>
            ) : null}

            {features.signLanguage ? (
              <KidsActionButton
                testId="kids-action-sign-language"
                icon={<Hand className="h-5 w-5" />}
                label={
                  signLanguage
                    ? tk("kids-action-sign-off", "Signs off")
                    : tk("kids-action-sign-on", "Signs on")
                }
                onClick={toggleSignLanguage}
                active={signLanguage}
              />
            ) : null}

            {features.easyRead ? (
              <KidsActionButton
                testId="kids-action-easy-read"
                icon={<CaseSensitive className="h-5 w-5" />}
                label={
                  easyRead
                    ? tk("kids-action-easy-read-off", "Easy read off")
                    : tk("kids-action-easy-read-on", "Easy read on")
                }
                onClick={toggleEasyRead}
                active={easyRead}
              />
            ) : null}

            {features.glossary ? (
              <KidsActionButton
                testId="kids-action-glossary"
                icon={<BookOpen className="h-5 w-5" />}
                label={
                  glossary
                    ? tk("kids-action-glossary-off", "Word helper off")
                    : tk("kids-action-glossary-on", "Word helper on")
                }
                onClick={toggleGlossary}
                active={glossary}
              />
            ) : null}

            {features.eli5 ? (
              <KidsActionButton
                testId="kids-action-eli5"
                icon={<Sparkles className="h-5 w-5" />}
                label={tk("kids-action-eli5", "Explain it")}
                onClick={openEli5}
              />
            ) : null}

            {features.notepad ? (
              <KidsActionButton
                testId="kids-action-notes"
                icon={<NotebookPen className="h-5 w-5" />}
                label={tk("kids-action-notes", "My notes")}
                onClick={openNotepad}
              />
            ) : null}

            {languageCount > 1 ? (
              <KidsActionButton
                testId="kids-action-language"
                icon={<Languages className="h-5 w-5" />}
                label={tk("kids-action-language", "Change language")}
                onClick={() => setLanguageDialogOpen(true)}
              />
            ) : null}

            <KidsActionButton
              testId="kids-action-story-map"
              icon={<Map className="h-5 w-5" />}
              label={tk("kids-action-story-map", "Story map")}
              onClick={() => setStoryMapDialogOpen(true)}
            />
          </div>
        </div>
      ) : null}

      <KidsLanguageDialog />
      <KidsStoryMapDialog />

      <button
        type="button"
        data-testid="kids-buddy-fab"
        aria-expanded={open}
        aria-label={tk("kids-buddy-open", "Talk to ${name}", {
          name: buddyName,
        })}
        onClick={handleFabClick}
        className={cn(
          "flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full",
          "shadow-2xl ring-4 ring-white/90",
          "transition-all duration-200 ease-out hover:scale-105 active:scale-95",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
          !reduceMotion && "kids-buddy-idle",
        )}
        style={{ backgroundColor: buddy.backgroundColor }}
      >
        <span style={paletteVars as CSSProperties}>
          <KidsBuddyArt
            art={character.art}
            title={buddyName}
            className="block h-[68px] w-[68px] [&_svg]:h-full [&_svg]:w-full"
          />
        </span>
      </button>
    </div>
  )
}

function KidsLanguageDialog() {
  const { tk } = useKidsTranslation()
  const config = useAtomValue(appConfigAtom)
  const [open, setOpen] = useAtom(kidsLanguageDialogOpenAtom)
  const [currentLanguage, setCurrentLanguage] = useAtom(currentLanguageAtom)
  const { say } = useBuddySpeech()
  const reduceMotion = useAtomValue(reduceMotionAtom)

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-language-title", "Pick a language")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
    >
      <div className="grid gap-2">
        {config.languages.available.map((language) => {
          const active = language === currentLanguage
          const name = getLanguageName(language)
          return (
            <button
              type="button"
              key={language}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setCurrentLanguage(language)
                setOpen(false)
                say(
                  tk("kids-confirm-language", "Okay, ${language} is on!", {
                    language: name,
                  }),
                )
              }}
              className={cn(
                "flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left text-xl font-extrabold shadow-sm ring-1 ring-slate-200",
                "transition-all duration-150 hover:bg-amber-100 active:scale-[0.99]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400",
                active && "bg-amber-100 ring-2 ring-amber-400",
              )}
            >
              <span>{name}</span>
              {active ? <Check className="h-6 w-6" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </KidsModal>
  )
}

function KidsStoryMapDialog() {
  const { tk } = useKidsTranslation()
  const [open, setOpen] = useAtom(kidsStoryMapDialogOpenAtom)
  const toc = useAtomValue(tocAtom)
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const entries = useMemo<TocEntry[]>(
    () =>
      toc.length > 0
        ? toc
        : pages.map((page, index) => ({
            section_id: page.section_id,
            href: page.href,
            title: `${tk("kids-page-label", "Page")} ${index + 1}`,
            chapter_id: page.section_id,
          })),
    [pages, tk, toc],
  )

  return (
    <KidsModal
      open={open}
      onClose={() => setOpen(false)}
      title={tk("kids-story-map-title", "Story map")}
      reduceMotion={reduceMotion}
      closeLabel={tk("kids-dialog-close", "Close")}
      wide
    >
      <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const active = entry.section_id === currentSectionId
          return (
            <button
              type="button"
              key={entry.section_id}
              aria-current={active ? "page" : undefined}
              onClick={() => navigateToHref(entry.href)}
              className={cn(
                "min-h-16 rounded-2xl bg-white px-4 py-3 text-left text-xl font-extrabold shadow-sm ring-1 ring-slate-200",
                "transition-all duration-150 hover:bg-amber-100 active:scale-[0.99]",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400",
                active && "bg-amber-100 ring-2 ring-amber-400",
                entry.level === 2 && "ml-5",
                entry.level === 3 && "ml-9",
              )}
            >
              {entry.title}
            </button>
          )
        })}
      </div>
    </KidsModal>
  )
}

function KidsModal({
  open,
  onClose,
  title,
  closeLabel,
  reduceMotion,
  wide,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  reduceMotion: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const focusable = getFocusable(dialog)
    ;(focusable[0] ?? dialog)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const items = getFocusable(dialog)
      if (items.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={closeLabel}
        className={cn(
          "absolute inset-0 bg-black/25 backdrop-blur-sm",
          "transition-opacity duration-200",
        )}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative grid max-h-[min(80vh,42rem)] w-full gap-4 overflow-hidden rounded-[2rem] bg-amber-50 p-5 text-slate-900 shadow-2xl ring-2 ring-white",
          wide ? "max-w-2xl" : "max-w-lg",
          "transition-all duration-200 ease-out",
          !reduceMotion && "motion-safe:animate-kidsBuddyPop",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <KidsDialogClose label={closeLabel} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"))
}

function KidsResumeChip() {
  const { tk } = useKidsTranslation()
  const [lastSpot, setLastSpot] = useAtom(kidsLastSpotAtom)
  const [dismissed, setDismissed] = useAtom(kidsResumeChipDismissedAtom)
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const currentPage = useAtomValue(currentPageNumberAtom)
  const initialLastSpotRef = useRef<KidsLastSpot | null>(lastSpot)
  const shouldOfferResumeRef = useRef(
    typeof window !== "undefined" &&
      window.sessionStorage.getItem(RESUME_SESSION_KEY) !== "true",
  )
  const currentSpot = useMemo(
    () => getCurrentSpot(pages, currentSectionId, currentPage),
    [currentPage, currentSectionId, pages],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(RESUME_SESSION_KEY, "true")
  }, [])

  useEffect(() => {
    if (!currentSpot) return
    setLastSpot(currentSpot)
  }, [currentSpot, setLastSpot])

  const initialLastSpot = initialLastSpotRef.current
  const show =
    shouldOfferResumeRef.current &&
    !dismissed &&
    !!initialLastSpot &&
    !!currentSpot &&
    initialLastSpot.sectionId !== currentSpot.sectionId

  if (!show || !initialLastSpot) return null

  return (
    <div
      data-testid="kids-resume-chip"
      className="mb-1 flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-full bg-white px-2 py-2 shadow-xl ring-2 ring-amber-200"
    >
      <button
        type="button"
        onClick={() => navigateToHref(initialLastSpot.href)}
        className="min-h-11 rounded-full bg-amber-100 px-4 text-sm font-extrabold text-slate-950 transition-all duration-150 hover:bg-amber-200 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
      >
        {tk("kids-resume-chip", "Take me back to where I was")}
      </button>
      <button
        type="button"
        aria-label={tk("kids-resume-dismiss", "Dismiss")}
        onClick={() => setDismissed(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-all duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

function KidsDialogClose({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all duration-150 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
    >
      <X className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}

function getSpeedState(speed: number) {
  if (speed < 1) {
    return {
      icon: <Turtle className="h-5 w-5" />,
      label: (tk: ReturnType<typeof useKidsTranslation>["tk"]) =>
        tk("kids-action-speed-slow", "Turtle speed"),
    }
  }
  if (speed > 1) {
    return {
      icon: <Rabbit className="h-5 w-5" />,
      label: (tk: ReturnType<typeof useKidsTranslation>["tk"]) =>
        tk("kids-action-speed-fast", "Rabbit speed"),
    }
  }
  return {
    icon: <Gauge className="h-5 w-5" />,
    label: (tk: ReturnType<typeof useKidsTranslation>["tk"]) =>
      tk("kids-action-speed-normal", "Normal speed"),
  }
}

function nextSpeed(speed: number): (typeof SPEEDS)[number] {
  if (speed < 1) return 1
  if (speed === 1) return 1.3
  return 0.75
}

function getCurrentSpot(
  pages: { section_id: string; href: string; page_number?: number }[],
  currentSectionId: string | null,
  currentPage: number | null,
): KidsLastSpot | null {
  const current = pages.find((page) => page.section_id === currentSectionId)
  if (!current) return null
  return {
    sectionId: current.section_id,
    href: current.href,
    page: currentPage ?? current.page_number ?? null,
  }
}

function getLanguageName(language: string) {
  const names: Record<string, string> = {
    en: "English",
    es: "Español",
    fr: "Français",
    "pt-BR": "Português (Brasil)",
    sq: "Shqip",
  }
  return names[language] ?? language
}
