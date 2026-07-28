import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { disableNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { GripHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { signLanguageModeAtom, slVideoPositionAtom } from "@/shared/state/ui.atoms"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { currentPageSignLanguageVideoAtom } from "@/features/sign-language/state/sign-language.atoms"
import { activeMediaAtom } from "@/features/audio/state/audio.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { cn } from "@/shared/lib/utils"

interface Position {
  x: number
  y: number
}

export function SLVideo() {
  const features = useAtomValue(appConfigAtom).features
  const slMode = useAtomValue(signLanguageModeAtom)
  const videoFilename = useAtomValue(currentPageSignLanguageVideoAtom)
  const activeMedia = useAtomValue(activeMediaAtom)
  const setActiveMedia = useSetAtom(activeMediaAtom)
  const lang = useAtomValue(currentLanguageAtom)
  const { t } = useTranslation()

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useAtom(slVideoPositionAtom)
  const [isDragging, setIsDragging] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)

  // `src` is the single source of truth: it is non-null exactly when the
  // feature is enabled, the toggle is on, and the current page has a video.
  // Deriving `visible` from it (rather than the other way round) lets the
  // early return below narrow `src` to a string for the <video> element.
  const src =
    features.signLanguage && slMode && videoFilename !== null
      ? `./content/i18n/${lang}/video/${videoFilename}`
      : null
  const visible = src !== null

  useEffect(() => {
    const el = containerRef.current
    const handle = handleRef.current
    if (!el || !handle || !visible) return

    let cursorOffset: Position = { x: 0, y: 0 }

    const clamp = (next: Position): Position => {
      const maxX = window.innerWidth - el.offsetWidth
      const maxY = window.innerHeight - el.offsetHeight
      return {
        x: Math.max(0, Math.min(next.x, maxX)),
        y: Math.max(0, Math.min(next.y, maxY)),
      }
    }

    return draggable({
      element: el,
      dragHandle: handle,
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        disableNativeDragPreview({ nativeSetDragImage })
      },
      onDragStart: ({ location }) => {
        const rect = el.getBoundingClientRect()
        cursorOffset = {
          x: location.initial.input.clientX - rect.left,
          y: location.initial.input.clientY - rect.top,
        }
        setIsDragging(true)
      },
      onDrag: ({ location }) => {
        const next = clamp({
          x: location.current.input.clientX - cursorOffset.x,
          y: location.current.input.clientY - cursorOffset.y,
        })
        el.style.left = `${next.x}px`
        el.style.top = `${next.y}px`
        el.style.right = "auto"
        el.style.bottom = "auto"
      },
      onDrop: ({ location }) => {
        const next = clamp({
          x: location.current.input.clientX - cursorOffset.x,
          y: location.current.input.clientY - cursorOffset.y,
        })
        setPosition(next)
        setIsDragging(false)
      },
    })
  }, [visible])

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
  const containerHeight = videoHeight + 24
  const style = positioned
    ? {
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
        height: `${containerHeight}px`,
      }
    : { height: `${containerHeight}px` }

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
        ref={handleRef}
        role="button"
        aria-label={t("sign-language-drag-handle") || "Drag sign language video"}
        tabIndex={0}
        className={cn(
          "h-6 w-full flex items-center justify-center",
          "bg-black/80 text-white/70 hover:text-white",
          "cursor-grab active:cursor-grabbing select-none",
        )}
      >
        <GripHorizontal className="w-4 h-4" aria-hidden />
      </div>
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
        className="w-full h-[calc(100%-1.5rem)] object-contain bg-black"
      />
    </div>
  )
}
