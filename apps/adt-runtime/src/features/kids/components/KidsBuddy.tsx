import {
  BookOpen,
  Hand,
  Languages,
  Map,
  NotebookPen,
  Pause,
  RotateCcw,
  Settings2,
  Sparkles,
  TextQuote,
  Volume2,
} from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  audioSpeedAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { KidsMenu } from "@/features/kids/components/menu/KidsMenu"
import type {
  KidsMenuAction,
  KidsMenuModel,
} from "@/features/kids/components/menu/kids-menu-model"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import {
  getBuddyImages,
  type BuddyExpression,
} from "@/features/kids/assets/buddy-images"
import {
  KidsAccessibilityDialog,
  KidsAvatarDialog,
  KidsLanguageDialog,
  KidsResumeChip,
  KidsStoryMapDialog,
} from "@/features/kids/components/kids-dialogs"
import { KidsAvatar } from "@/features/kids/components/KidsAvatar"
import { useKidsAvailableLanguages } from "@/features/kids/hooks/useKidsAvailableLanguages"
import { useBuddySpeech } from "@/features/kids/hooks/useBuddySpeech"
import { useBuddyIdleChatter } from "@/features/kids/hooks/useBuddyIdleChatter"
import { BUDDY_LINES } from "@/features/kids/lib/buddy-lines"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import {
  buddySpeechAtom,
  kidsAccessibilityDialogOpenAtom,
  kidsAvatarAtom,
  kidsAvatarDialogOpenAtom,
  kidsBuddyChatterAtom,
  kidsBuddyPanelOpenAtom,
  kidsBuddyAtom,
  kidsLanguageDialogOpenAtom,
  kidsMenuVariantAtom,
  kidsOnboardingDoneAtom,
  kidsPlayerNameAtom,
  kidsStoryMapDialogOpenAtom,
} from "@/features/kids/state/kids.atoms"
import { getCharacter } from "@/features/kids/lib/characters"
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
  const setReadAloudMode = useSetAtom(readAloudModeAtom)
  const [signLanguage, setSignLanguage] = useAtom(signLanguageModeAtom)
  const [easyRead, setEasyRead] = useAtom(easyReadModeAtom)
  const [glossary, setGlossary] = useAtom(glossaryModeAtom)
  const setEli5Mode = useSetAtom(eli5ModeAtom)
  const setEli5Open = useSetAtom(eli5PopupOpenAtom)
  const setNotepadOpen = useSetAtom(notepadOpenAtom)
  const setLanguageDialogOpen = useSetAtom(kidsLanguageDialogOpenAtom)
  const setStoryMapDialogOpen = useSetAtom(kidsStoryMapDialogOpenAtom)
  const setAccessibilityDialogOpen = useSetAtom(kidsAccessibilityDialogOpenAtom)
  const setAvatarDialogOpen = useSetAtom(kidsAvatarDialogOpenAtom)
  const avatar = useAtomValue(kidsAvatarAtom)
  const chatter = useAtomValue(kidsBuddyChatterAtom)
  const setOnboardingDone = useSetAtom(kidsOnboardingDoneAtom)
  // Count languages the kids reader can meaningfully switch to (book content
  // or the kids interface is translated) — a book may declare a language with
  // nothing translated yet.
  const languageCount = useKidsAvailableLanguages().languages.length
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelCloseRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  // Guards the gap between the buddy's line and the narration starting.
  const readIntentRef = useRef(0)
  const menuVariant = useAtomValue(kidsMenuVariantAtom)

  useBuddyIdleChatter({
    say,
    character: buddy.character,
    enabled: chatter && !open && !isPlaying,
  })

  const character = useMemo(
    () => getCharacter(buddy.character),
    [buddy.character],
  )
  const buddyName = tk(
    character.defaultNameKey,
    character.defaultNameFallback,
  )
  const fabVariant: BuddyExpression = open
    ? "happy"
    : speech
      ? "excited"
      : "standing"
  const readLabel = isPlaying
    ? tk("kids-action-pause", "Take a break")
    : tk("kids-action-read", "Read to me")
  const onLabel = tk("kids-toggle-on", "On")
  const offLabel = tk("kids-toggle-off", "Off")
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
    if (playerName) {
      say(BUDDY_LINES.greetName, { name: playerName })
    } else {
      say(BUDDY_LINES.greet)
    }
  }, [playerName, say])

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

  const handleRead = () => {
    // Pausing takes effect at once — the child asked for quiet.
    if (isPlaying) {
      togglePlayPause()
      void say(BUDDY_LINES.readBreak)
      return
    }
    // Starting waits for the buddy to finish its line first, so the book's
    // narration doesn't talk over it.
    setReadAloudMode(true)
    const token = ++readIntentRef.current
    void say(BUDDY_LINES.readStart).then(() => {
      // A second tap, or anything else that started or stopped playback while
      // the buddy was talking, supersedes this one.
      if (token !== readIntentRef.current) return
      togglePlayPause()
    })
  }

  const handleSpeed = (next: number) => {
    setSpeed(next)
    if (next < 1) {
      say(BUDDY_LINES.speedSlow)
    } else if (next > 1) {
      say(BUDDY_LINES.speedFast)
    } else {
      say(BUDDY_LINES.speedNormal)
    }
  }

  const toggleSignLanguage = () => {
    const next = !signLanguage
    trackToggleEvent("SignLanguage", next)
    setSignLanguage(next)
    say(next ? BUDDY_LINES.signOn : BUDDY_LINES.signOff)
  }

  const toggleEasyRead = () => {
    const next = !easyRead
    trackToggleEvent("EasyRead", next)
    setEasyRead(next)
    say(next ? BUDDY_LINES.easyReadOn : BUDDY_LINES.easyReadOff)
  }

  const toggleGlossary = () => {
    const next = !glossary
    trackToggleEvent("GlossaryHighlight", next)
    setGlossary(next)
    say(next ? BUDDY_LINES.glossaryOn : BUDDY_LINES.glossaryOff)
  }

  const openEli5 = () => {
    setEli5Mode(true)
    setEli5Open(true)
    setOpen(false)
    say(BUDDY_LINES.eli5Open)
  }

  const openNotepad = () => {
    setNotepadOpen(true)
    setOpen(false)
    say(BUDDY_LINES.notesOpen)
  }

  const openComfort = () => {
    setAccessibilityDialogOpen(true)
    say(BUDDY_LINES.comfortOpen)
  }

  const openAvatar = () => {
    setAvatarDialogOpen(true)
  }

  const meetBuddyAgain = () => {
    setOnboardingDone(false)
    setOpen(false)
  }

  const actions: KidsMenuAction[] = []
  const push = (action: KidsMenuAction) => actions.push(action)

  if (features.readAloud) {
    push({
      id: "read",
      testId: "kids-action-read",
      label: readLabel,
      shortLabel: readLabel,
      icon: isPlaying ? (
        <Pause className="h-5 w-5" fill="currentColor" />
      ) : (
        <Volume2 className="h-5 w-5" />
      ),
      group: "reading",
      onSelect: handleRead,
      toggle: false,
      active: isPlaying,
      disabled: !hasItems,
    })
  }

  push({
    id: "comfort",
    testId: "kids-action-comfort",
    label: tk("kids-action-comfort", "Make it comfy"),
    shortLabel: tk("kids-action-comfort", "Make it comfy"),
    icon: <Settings2 className="h-5 w-5" />,
    group: "look",
    onSelect: openComfort,
    toggle: false,
    active: false,
    disabled: false,
  })

  if (features.signLanguage) {
    push({
      id: "sign-language",
      testId: "kids-action-sign-language",
      label: tk("kids-action-sign", "Sign language"),
      shortLabel: tk("kids-action-sign", "Sign language"),
      icon: <Hand className="h-5 w-5" />,
      group: "look",
      onSelect: toggleSignLanguage,
      toggle: true,
      active: signLanguage,
      disabled: false,
    })
  }

  if (features.easyRead) {
    push({
      id: "easy-read",
      testId: "kids-action-easy-read",
      label: tk("kids-action-easy-read", "Easy read"),
      shortLabel: tk("kids-action-easy-read", "Easy read"),
      icon: <TextQuote className="h-5 w-5" />,
      group: "look",
      onSelect: toggleEasyRead,
      toggle: true,
      active: easyRead,
      disabled: false,
    })
  }

  if (features.glossary) {
    push({
      id: "glossary",
      testId: "kids-action-glossary",
      label: tk("kids-action-glossary", "Word helper"),
      shortLabel: tk("kids-action-glossary", "Word helper"),
      icon: <BookOpen className="h-5 w-5" />,
      group: "look",
      onSelect: toggleGlossary,
      toggle: true,
      active: glossary,
      disabled: false,
    })
  }

  push({
    id: "avatar",
    testId: "kids-action-avatar",
    label: tk("kids-action-avatar", "My character"),
    shortLabel: tk("kids-action-avatar", "My character"),
    icon: <KidsAvatar config={avatar} size={44} />,
    group: "mine",
    onSelect: openAvatar,
    toggle: false,
    active: false,
    disabled: false,
  })

  push({
    id: "story-map",
    testId: "kids-action-story-map",
    label: tk("kids-action-story-map", "Story map"),
    shortLabel: tk("kids-action-story-map", "Story map"),
    icon: <Map className="h-5 w-5" />,
    group: "mine",
    onSelect: () => setStoryMapDialogOpen(true),
    toggle: false,
    active: false,
    disabled: false,
  })

  if (features.eli5) {
    push({
      id: "eli5",
      testId: "kids-action-eli5",
      label: tk("kids-action-eli5", "Explain it"),
      shortLabel: tk("kids-action-eli5", "Explain it"),
      icon: <Sparkles className="h-5 w-5" />,
      group: "mine",
      onSelect: openEli5,
      toggle: false,
      active: false,
      disabled: false,
    })
  }

  if (features.notepad) {
    push({
      id: "notes",
      testId: "kids-action-notes",
      label: tk("kids-action-notes", "My notes"),
      shortLabel: tk("kids-action-notes", "My notes"),
      icon: <NotebookPen className="h-5 w-5" />,
      group: "mine",
      onSelect: openNotepad,
      toggle: false,
      active: false,
      disabled: false,
    })
  }

  if (languageCount > 1) {
    push({
      id: "language",
      testId: "kids-action-language",
      label: tk("kids-action-language", "Change language"),
      shortLabel: tk("kids-action-language-short", "Language"),
      icon: <Languages className="h-5 w-5" />,
      group: "mine",
      onSelect: () => setLanguageDialogOpen(true),
      toggle: false,
      active: false,
      disabled: false,
    })
  }

  push({
    id: "meet-again",
    testId: "kids-action-meet-again",
    label: tk("kids-action-meet-again", "Meet my buddy again"),
    shortLabel: tk("kids-action-meet-again-short", "Start over"),
    icon: <RotateCcw className="h-5 w-5" />,
    group: "footer",
    onSelect: meetBuddyAgain,
    toggle: false,
    active: false,
    disabled: false,
  })

  const model: KidsMenuModel = {
    message: panelMessage,
    buddyName,
    buddyBackground: buddy.backgroundColor,
    buddyImages: getBuddyImages(buddy.character),
    avatar,
    actions,
    groups: [
      { id: "reading", title: tk("kids-group-reading", "Reading") },
      { id: "look", title: tk("kids-group-look", "How it looks") },
      { id: "mine", title: tk("kids-group-mine", "My things") },
    ],
    speed,
    setSpeed: handleSpeed,
    speedLabels: {
      slow: tk("kids-action-speed-slow", "Turtle"),
      normal: tk("kids-action-speed-normal", "Normal"),
      fast: tk("kids-action-speed-fast", "Rabbit"),
      group: tk("kids-action-speed-label", "How fast I read"),
    },
    showSpeed: features.readAloud === true,
    onLabel,
    offLabel,
    closeLabel: tk("kids-dialog-close", "Close"),
    regionLabel: tk("kids-buddy-actions-region", "Buddy actions"),
    backLabel: tk("kids-menu-back", "Go back"),
    moreLabel: tk("kids-menu-more", "More"),
    previousLabel: tk("kids-menu-scroll-previous", "Show earlier"),
    nextLabel: tk("kids-menu-scroll-next", "Show more"),
    close: () => setOpen(false),
  }

  return (
    <div
      data-testid="kids-buddy"
      className="pointer-events-auto fixed bottom-5 right-5 z-[59] flex flex-col items-end gap-3"
    >
      <KidsResumeChip />
      {open ? (
        <KidsMenu
          variant={menuVariant}
          model={model}
          panelRef={panelRef}
          panelCloseRef={panelCloseRef}
          reduceMotion={reduceMotion}
        />
      ) : null}

      <KidsLanguageDialog />
      <KidsStoryMapDialog />
      <KidsAccessibilityDialog />
      <KidsAvatarDialog />

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
        <KidsBuddyImage
          key={fabVariant}
          images={getBuddyImages(buddy.character)}
          variant={fabVariant}
          title={buddyName}
          className={cn(
            "h-[68px] w-[68px]",
            !reduceMotion && "animate-kidsBuddyPop",
          )}
        />
      </button>
    </div>
  )
}
