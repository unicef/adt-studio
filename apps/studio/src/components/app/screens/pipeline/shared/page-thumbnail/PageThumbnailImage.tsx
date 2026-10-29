import { useState, type CSSProperties } from "react"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { pageThumbnailSources, rememberLoadedThumbnail } from "./pageThumbnail"

export function PageThumbnailImage({
  label,
  pageId,
  cssWidth,
  alt = "",
  dimmed = false,
  className,
  style,
}: {
  label: string
  pageId: string
  cssWidth: number
  alt?: string
  dimmed?: boolean
  className?: string
  style?: CSSProperties
}) {
  const { src, srcSet } = pageThumbnailSources(label, pageId, cssWidth)
  const [state, setState] = useState<{ src: string; status: "loading" | "loaded" | "failed" }>({ src, status: "loading" })
  const status = state.src === src ? state.status : "loading"

  if (status === "failed")
    return (
      <span aria-hidden className="relative grid size-full place-items-center bg-muted text-muted-foreground/50">
        <FileText className="size-4" />
      </span>
    )
  return (
    <img
      src={src}
      srcSet={srcSet}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={(event) => {
        rememberLoadedThumbnail(label, pageId, event.currentTarget.currentSrc || src)
        setState({ src, status: "loaded" })
      }}
      onError={() => setState({ src, status: "failed" })}
      style={style}
      className={cn(
        "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        status !== "loaded" ? "opacity-0" : dimmed ? "opacity-60" : "opacity-100",
        className,
      )}
    />
  )
}
