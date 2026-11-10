import { useRef, useState, type ReactNode } from "react"
import { Play } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function VideoFrame({ src, name, hex, badge }: { src: string; name: string; hex: string; badge?: ReactNode }) {
  const { t } = useLingui()
  const ref = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)

  const start = () => {
    setStarted(true)
    void ref.current?.play().catch(() => {})
  }

  return (
    <div className="group/frame relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
      <video
        ref={ref}
        src={src}
        controls={started}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => {
          if (event.currentTarget.currentTime === 0) event.currentTarget.currentTime = 0.001
        }}
        className="size-full object-contain"
      >
        <Trans>Your browser cannot play this video.</Trans>
      </video>
      <button
        type="button"
        onClick={start}
        tabIndex={started ? -1 : 0}
        aria-hidden={started || undefined}
        aria-label={t`Play ${name}`}
        className={cn(
          "absolute inset-0 grid place-items-center bg-black/0 outline-none transition-[opacity,background-color] duration-200 ease-out hover:bg-black/15 motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70",
          started && "pointer-events-none opacity-0",
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-white/90 shadow-md transition-transform duration-200 ease-out group-hover/frame:scale-105 motion-reduce:transition-none">
          <Play className="ml-0.5 size-4.5" style={{ color: hex, fill: hex }} />
        </span>
      </button>
      {badge && <div className={cn("pointer-events-none absolute top-2 left-2 transition-opacity duration-200", started && "opacity-0")}>{badge}</div>}
    </div>
  )
}
