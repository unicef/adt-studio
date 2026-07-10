import {
  BookOpen,
  CaseSensitive,
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
} from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useRef, type CSSProperties } from "react"
import {
  audioSpeedAtom,
  playBarVisibleAtom,
} from "@/features/audio/state/audio.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { buddyPaletteVars } from "@/features/kids/assets/buddies/buddy-art"
import { KidsActionButton } from "@/features/kids/components/KidsActionButton"
import { KidsBuddyArt } from "@/features/kids/components/KidsBuddyArt"
import {
  KidsDialogClose,
  KidsLanguageDialog,
  KidsResumeChip,
  KidsStoryMapDialog,
} from "@/features/kids/components/kids-dialogs"
import { useBuddySpeech } from "@/features/kids/hooks/useBuddySpeech"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import {
  buddySpeechAtom,
  kidsBuddyPanelOpenAtom,
  kidsBuddyAtom,
  kidsLanguageDialogOpenAtom,
  kidsPlayerNameAtom,
  kidsStoryMapDialogOpenAtom,
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
  signLanguageModeAtom,
} from "@/shared/state/ui.atoms"

const GREETING_SESSION_KEY = "kidsBuddyGreeted"
const SPEEDS = [0.75, 1, 1.3] as const

export function KidsBuddy() {
  const { tk } = useKidsTranslation()
  const config = useAtomValue(appConfigAtom)
  const features = config.features
  const buddy = useAtomValue(kidsBuddyAtom)
  const playerName = useAtomValue(kidsPlayerNameAtom).trim()
  const speech = useAtomValue(buddySpeechAtom)
  const setSpeech = useSetAtom(buddySpeechAtom)
  const reduceMotion = usePrefersReducedMotion()
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
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelCloseRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

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
  const panelMessage =
    speech ??
    (playerName
      ? tk(
          "kids-buddy-prompt-name",
          "Hi ${name}! What would you like me to do?",
          {
            name: playerName,
          },
        )
      : tk("kids-buddy-prompt", "What would you like me to do?"))

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
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        panelCloseRef.current?.focus()
      })
      wasOpenRef.current = true
      return () => window.cancelAnimationFrame(frame)
    }

    if (wasOpenRef.current) {
      fabRef.current?.focus()
      wasOpenRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, setOpen])

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
          ref={panelRef}
          data-testid="kids-buddy-panel"
          role="region"
          aria-labelledby="kids-buddy-panel-message"
          tabIndex={-1}
          className={cn(
            "relative mb-1 max-h-[min(72vh,34rem)] w-[min(26rem,calc(100vw-2rem))] overflow-visible rounded-[2rem] bg-white p-4 text-slate-950 shadow-2xl ring-2 ring-sky-100",
            reduceMotion
              ? "transition-none"
              : "transition-all duration-200 ease-out",
            !reduceMotion && "motion-safe:animate-kidsPanelOpen",
            "after:absolute after:-bottom-2 after:right-8 after:h-5 after:w-5 after:rotate-45 after:border-b-2 after:border-r-2 after:border-sky-100 after:bg-white",
          )}
        >
          <div
            className="relative z-10 flex max-h-[calc(min(72vh,34rem)-2rem)] flex-col gap-4 overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            role="region"
            aria-label={tk("kids-buddy-actions-region", "Buddy actions")}
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="kids-buddy-panel-message"
                data-testid="kids-buddy-panel-message"
                aria-live="polite"
                className="max-w-[19rem] text-balance text-2xl font-black leading-tight text-slate-950"
              >
                {panelMessage}
              </h2>
              <KidsDialogClose
                buttonRef={panelCloseRef}
                label={tk("kids-dialog-close", "Close")}
                onClick={() => setOpen(false)}
              />
            </div>
            <div className="flex flex-col gap-2">
              {features.readAloud ? (
                <>
                  <KidsActionButton
                    testId="kids-action-read"
                    variant="list"
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
                    variant="list"
                    icon={speedState.icon}
                    label={speedState.label(tk)}
                    onClick={handleSpeed}
                  />
                </>
              ) : null}

              {features.signLanguage ? (
                <KidsActionButton
                  testId="kids-action-sign-language"
                  variant="list"
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
                  variant="list"
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
                  variant="list"
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
                  variant="list"
                  icon={<Sparkles className="h-5 w-5" />}
                  label={tk("kids-action-eli5", "Explain it")}
                  onClick={openEli5}
                />
              ) : null}

              {features.notepad ? (
                <KidsActionButton
                  testId="kids-action-notes"
                  variant="list"
                  icon={<NotebookPen className="h-5 w-5" />}
                  label={tk("kids-action-notes", "My notes")}
                  onClick={openNotepad}
                />
              ) : null}

              {languageCount > 1 ? (
                <KidsActionButton
                  testId="kids-action-language"
                  variant="list"
                  icon={<Languages className="h-5 w-5" />}
                  label={tk("kids-action-language", "Change language")}
                  onClick={() => setLanguageDialogOpen(true)}
                />
              ) : null}

              <KidsActionButton
                testId="kids-action-story-map"
                variant="list"
                icon={<Map className="h-5 w-5" />}
                label={tk("kids-action-story-map", "Story map")}
                onClick={() => setStoryMapDialogOpen(true)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <KidsLanguageDialog />
      <KidsStoryMapDialog />

      <button
        ref={fabRef}
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
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
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
