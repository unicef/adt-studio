import { useAtom } from "jotai"
import { Pause, Play, Rewind, FastForward, X } from "lucide-react"
import { playBarVisibleAtom } from "@/features/audio/state/audio.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { usePrefersReducedMotion } from "@/features/kids/hooks/usePrefersReducedMotion"
import { cn } from "@/shared/lib/utils"

/**
 * Reading controls for kids mode.
 *
 * Kids mode replaces the whole `BottomDock`, and the audio player lived inside
 * it — so narration could be playing with nothing on screen to stop it. This is
 * the kid-facing equivalent: big targets, the same sky styling as the rest of
 * the chrome, and it only appears once there is something to control.
 *
 * Sits bottom-centre, clear of the page arrows at the sides and the buddy in
 * the corner.
 */
export function KidsPlayBar() {
  const { tk } = useKidsTranslation()
  const reduceMotion = usePrefersReducedMotion()
  const [visible, setVisible] = useAtom(playBarVisibleAtom)
  const { isPlaying, hasItems, togglePlayPause, playNext, playPrevious, stop } =
    useAudioPlayerContext()

  if (!visible || !hasItems) return null

  const close = () => {
    stop()
    setVisible(false)
  }

  return (
    <div
      data-testid="kids-play-bar"
      role="group"
      aria-label={tk("kids-player-region", "Reading controls")}
      className={cn(
        "pointer-events-auto fixed bottom-5 left-1/2 z-[58] -translate-x-1/2",
        "flex items-center gap-2 rounded-full bg-white p-2 pl-3",
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

      <span className="mx-1 h-8 w-0.5 rounded-full bg-sky-100" aria-hidden="true" />

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
        primary ? "h-16 w-16" : "h-12 w-12",
        primary
          ? "bg-sky-600 text-white shadow-[0_3px_0_#075985] hover:bg-sky-500"
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
