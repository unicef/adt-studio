import { useAtom, useAtomValue } from "jotai"
import { Pause, Play, Rewind, FastForward, X } from "lucide-react"
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { kidsBuddyPanelOpenAtom } from "@/features/kids/state/kids.atoms"
import { cn } from "@/shared/lib/utils"

/**
 * Reading controls for kids mode.
 *
 * Kids mode replaces the whole `BottomDock`, and the audio player lived inside
 * it — so narration could be playing with nothing on screen to stop it. This is
 * the kid-facing equivalent: big targets and the same sky styling as the rest of
 * the chrome.
 *
 * Visible whenever read-aloud is ON, not merely while audio happens to be
 * running. Gating it on playback hid the controls exactly when a child needs
 * them — paused, or at the start of a fresh page.
 *
 * Sits bottom-centre, clear of the page arrows at the sides and the buddy in
 * the corner.
 */
export function KidsPlayBar() {
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()
  const buddyPanelOpen = useAtomValue(kidsBuddyPanelOpenAtom)
  const [readAloud, setReadAloud] = useAtom(readAloudModeAtom)
  const { isPlaying, hasItems, togglePlayPause, playNext, playPrevious, stop } =
    useAudioPlayerContext()

  if (!readAloud || !hasItems || buddyPanelOpen) return null

  // The cross is "turn reading off", not "hide the controls" — otherwise the
  // child would dismiss the panel and read-aloud would silently stay on.
  const close = () => {
    stop()
    setReadAloud(false)
  }

  return (
    <div
      data-testid="kids-play-bar"
      role="group"
      aria-label={tk("kids-player-region", "Reading controls")}
      className={cn(
        // Centred once there is room; on a narrow screen it would sit under the
        // buddy in the corner, so it shifts left of it instead.
        "pointer-events-auto fixed bottom-3 z-[58] sm:bottom-5",
        "left-2 right-[5rem] sm:left-1/2 sm:right-auto sm:-translate-x-1/2",
        "flex items-center justify-center gap-1 rounded-full bg-[#FFFEFA] p-1.5 sm:gap-2 sm:p-2",
        "shadow-2xl ring-2 ring-sky-100",
        reduceMotion ? "transition-none" : "animate-kidsPanelOpen",
      )}
    >
      <PlayBarButton
        testId="kids-player-previous"
        label={tk("kids-player-previous", "Go back a bit")}
        onClick={playPrevious}
        reduceMotion={reduceMotion}
      >
        <Rewind className="h-6 w-6" fill="currentColor" />
      </PlayBarButton>

      <PlayBarButton
        testId="kids-player-toggle"
        label={
          isPlaying
            ? tk("kids-action-pause", "Take a break")
            : tk("kids-action-read", "Read to me")
        }
        onClick={togglePlayPause}
        primary
        reduceMotion={reduceMotion}
      >
        {isPlaying ? (
          <Pause className="h-8 w-8" fill="currentColor" />
        ) : (
          <Play className="h-8 w-8" fill="currentColor" />
        )}
      </PlayBarButton>

      <PlayBarButton
        testId="kids-player-next"
        label={tk("kids-player-next", "Skip ahead")}
        onClick={playNext}
        reduceMotion={reduceMotion}
      >
        <FastForward className="h-6 w-6" fill="currentColor" />
      </PlayBarButton>

      <span
        className="mx-0.5 h-8 w-0.5 rounded-full bg-sky-100 sm:mx-1"
        aria-hidden="true"
      />

      <PlayBarButton
        testId="kids-player-stop"
        label={tk("kids-player-stop", "Stop reading")}
        onClick={close}
        quiet
        reduceMotion={reduceMotion}
      >
        <X className="h-6 w-6" strokeWidth={3} />
      </PlayBarButton>
    </div>
  )
}

function PlayBarButton({
  children,
  label,
  onClick,
  testId,
  primary,
  quiet,
  reduceMotion,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  testId: string
  primary?: boolean
  quiet?: boolean
  reduceMotion: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        primary ? "h-14 w-14 sm:h-16 sm:w-16" : "h-11 w-11 sm:h-12 sm:w-12",
        primary
          ? "bg-sky-600 text-[#F8FCFF] shadow-[0_3px_0_#075985] hover:bg-sky-500"
          : quiet
            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
            : "bg-sky-100 text-sky-700 hover:bg-sky-200",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
        reduceMotion
          ? "transition-none"
          : "transition-[transform,background-color] duration-150 ease-out active:scale-95",
      )}
    >
      {children}
    </button>
  )
}
