import { Pause, Volume2 } from "lucide-react"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { buddyPaletteVars } from "@/features/kids/assets/buddies/buddy-art"
import { KidsBuddyArt } from "@/features/kids/components/KidsBuddyArt"
import { useBuddySpeech } from "@/features/kids/hooks/useBuddySpeech"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import {
  buddySpeechAtom,
  kidsBuddyAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { getCharacter, getPalette } from "@/features/kids/lib/characters"
import { cn } from "@/shared/lib/utils"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"

const GREETING_SESSION_KEY = "kidsBuddyGreeted"

export function KidsBuddy() {
  const { tk } = useKidsTranslation()
  const buddy = useAtomValue(kidsBuddyAtom)
  const playerName = useAtomValue(kidsPlayerNameAtom).trim()
  const setSpeech = useSetAtom(buddySpeechAtom)
  const reduceMotion = useAtomValue(reduceMotionAtom)
  const { isPlaying, hasItems, togglePlayPause } = useAudioPlayerContext()
  const { say } = useBuddySpeech()
  const [open, setOpen] = useState(false)

  const character = useMemo(
    () => getCharacter(buddy.character),
    [buddy.character],
  )
  const buddyName =
    buddy.name.trim() ||
    tk(character.defaultNameKey, character.defaultNameFallback)
  const palette = getPalette(character.art, buddy.palette)
  const paletteVars = buddyPaletteVars(palette)
  const actionLabel = isPlaying
    ? tk("kids-action-pause", "Take a break")
    : tk("kids-action-read", "Read to me")

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

  return (
    <div
      data-testid="kids-buddy"
      className="pointer-events-auto fixed bottom-5 right-5 z-[59] flex flex-col items-end gap-3"
    >
      {open ? (
        <div
          data-testid="kids-buddy-panel"
          className={cn(
            "w-56 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/10",
            "transition-all duration-200 ease-out",
            "motion-safe:animate-kidsBuddyPop",
          )}
        >
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!hasItems}
            className={cn(
              "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3",
              "text-left text-lg font-bold text-slate-900",
              "transition-all duration-150",
              "hover:bg-amber-50 active:scale-[0.98]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:active:scale-100",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </span>
            <span>{actionLabel}</span>
          </button>
        </div>
      ) : null}

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
