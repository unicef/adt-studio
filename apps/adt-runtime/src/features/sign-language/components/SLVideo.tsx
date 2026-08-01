import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { signLanguageModeAtom, slVideoPositionAtom } from "@/shared/state/ui.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { currentPageSignLanguageVideoAtom } from "@/features/sign-language/state/sign-language.atoms"
import { activeMediaAtom } from "@/features/audio/state/audio.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { cn } from "@/shared/lib/utils"

interface Position {
  x: number
  y: number
}

export function SLVideo() {
  const features = useAtomValue(appConfigAtom).features
  const slMode = useAtomValue(signLanguageModeAtom)
  const setSlMode = useSetAtom(signLanguageModeAtom)
  const videoFilename = useAtomValue(currentPageSignLanguageVideoAtom)
  const activeMedia = useAtomValue(activeMediaAtom)
  const setActiveMedia = useSetAtom(activeMediaAtom)
  const lang = useAtomValue(currentLanguageAtom)
  const isMobile = useIsMobile()
  const { t } = useTranslation()

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dragOffsetRef = useRef<Position | null>(null)
  const [position, setPosition] = useAtom(slVideoPositionAtom)
  const [isDragging, setIsDragging] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)

  // `src` is the single source of truth: it is non-null exactly when the
  // feature is enabled, the toggle is on, and the current page has a video.
  const src =
    features.signLanguage && slMode && videoFilename !== null
      ? `./content/i18n/${lang}/video/${videoFilename}`
      : null

  useEffect(() => {
    setAspectRatio(null)
  }, [src])

  useEffect(() => {
    if (activeMedia !== "tts") return
    videoRef.current?.pause()
  }, [activeMedia])

  if (src === null) return null

  const positioned = position !== null
  const baseWidth = 320
  const videoHeight = aspectRatio
    ? Math.round(baseWidth / aspectRatio)
    : Math.round(baseWidth * (3 / 5))
  const handleHeight = isMobile ? 44 : 24
  const containerHeight = videoHeight + handleHeight

  const clamp = (next: Position): Position => {
    const el = containerRef.current
    const w = el?.offsetWidth ?? baseWidth
    const h = el?.offsetHeight ?? containerHeight
    return {
      x: Math.max(0, Math.min(next.x, window.innerWidth - w)),
      y: Math.max(0, Math.min(next.y, window.innerHeight - h)),
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    if (!el) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    const offset = dragOffsetRef.current
    if (!el || !offset) return
    const next = clamp({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    el.style.left = `${next.x}px`
    el.style.top = `${next.y}px`
    el.style.right = "auto"
    el.style.bottom = "auto"
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    const offset = dragOffsetRef.current
    if (!el || !offset) return
    const next = clamp({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    dragOffsetRef.current = null
    setPosition(next)
    setIsDragging(false)
  }

  const style: React.CSSProperties = positioned
    ? {
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
        height: containerHeight,
      }
    : { height: containerHeight }

  return (
    <div
      ref={containerRef}
      style={style}
      className={cn(
        "fixed w-80 max-w-[calc(100vw-2rem)]",
        "bg-black rounded-lg shadow-lg overflow-hidden z-[49]",
        "transition-shadow",
        isDragging && "shadow-2xl ring-2 ring-primary",
        !positioned && "bottom-20 right-4",
      )}
    >
      <div
        role="button"
        aria-label={t("sign-language-drag-handle") || "Drag sign language video"}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ height: handleHeight, touchAction: "none" }}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "bg-black/80 text-white/70 hover:text-white",
          "cursor-grab select-none touch-none",
          isDragging ? "cursor-grabbing" : "active:cursor-grabbing",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "rounded-full bg-white/60",
            isMobile ? "h-1.5 w-12" : "h-1 w-8",
          )}
        />
      </div>
      <button
        type="button"
        aria-label={t("close") || "Close"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          videoRef.current?.pause()
          setSlMode(false)
        }}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 transition-colors hover:bg-black/90 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <video
        ref={videoRef}
        key={src}
        src={src}
        autoPlay
        playsInline
        controls
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoWidth && v.videoHeight) {
            setAspectRatio(v.videoWidth / v.videoHeight)
          }
        }}
        onPlay={() => setActiveMedia("sign-language")}
        style={{ height: videoHeight }}
        className="w-full object-contain bg-black"
      />
    </div>
  )
}
