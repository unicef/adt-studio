import { memo, useState } from "react"
import { Crop, Eye, EyeOff, ImageOff, Loader2, Scissors, Square } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { extractedImageUrl } from "./useExtractImages"

export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

function CardAction({
  onClick,
  disabled,
  title,
  active,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex size-5 items-center justify-center rounded-full transition-colors disabled:cursor-default",
        active
          ? "bg-destructive hover:bg-destructive/80"
          : "bg-black/30 opacity-0 hover:bg-black/50 group-hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      {children}
    </button>
  )
}

export const ExtractImageCard = memo(function ExtractImageCard({
  label,
  imageId,
  isPruned,
  reason,
  bounds,
  width,
  height,
  cacheKey,
  segmenting,
  showRecrop,
  showSegment,
  onTogglePrune,
  onRecrop,
  onSegment,
}: {
  label: string
  imageId: string
  isPruned?: boolean
  reason?: string
  bounds?: ImageBounds
  width?: number
  height?: number
  cacheKey: number
  segmenting: boolean
  showRecrop: boolean
  showSegment: boolean
  onTogglePrune: (imageId: string) => void
  onRecrop: (imageId: string) => void
  onSegment: (imageId: string) => void
}) {
  const { t } = useLingui()
  const [failed, setFailed] = useState(false)
  const [loadedDims, setLoadedDims] = useState<{ w: number; h: number } | null>(null)
  const dims = width && height ? { w: width, h: height } : loadedDims

  return (
    <div
      className="group relative flex min-h-[80px] flex-col items-center overflow-hidden rounded-lg border bg-card"
      title={isPruned && reason ? t`Pruned: ${reason}` : undefined}
    >
      {bounds && (
        <div
          className="absolute left-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/30 text-white"
          title={t`Position ${Math.round(bounds.x)}, ${Math.round(bounds.y)} → ${Math.round(bounds.width)}×${Math.round(bounds.height)} pt`}
        >
          <Square className="size-3" />
        </div>
      )}
      <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
        {showRecrop && (
          <CardAction onClick={() => onRecrop(imageId)} title={t`Recrop from page`}>
            <Crop className="size-3 text-white" />
          </CardAction>
        )}
        {showSegment && (
          <button
            type="button"
            onClick={() => onSegment(imageId)}
            disabled={segmenting}
            title={segmenting ? t`Segmenting…` : t`Segment image`}
            aria-label={segmenting ? t`Segmenting…` : t`Segment image`}
            className={cn(
              "flex size-5 items-center justify-center rounded-full transition-colors disabled:cursor-default",
              segmenting
                ? "bg-orange-500"
                : "bg-black/30 opacity-0 hover:bg-black/50 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            {segmenting ? (
              <Loader2 className="size-3 animate-spin text-white motion-reduce:animate-none" />
            ) : (
              <Scissors className="size-3 text-white" />
            )}
          </button>
        )}
        <CardAction
          onClick={() => onTogglePrune(imageId)}
          title={isPruned ? t`Unprune image` : t`Prune image`}
          active={isPruned}
        >
          {isPruned ? <EyeOff className="size-3 text-white" /> : <Eye className="size-3 text-white" />}
        </CardAction>
      </div>

      {failed ? (
        <div className="grid min-h-[80px] w-full flex-1 place-items-center bg-muted text-muted-foreground/50">
          <ImageOff className="size-4" />
        </div>
      ) : (
        <img
          src={extractedImageUrl(label, imageId, cacheKey)}
          alt={imageId}
          className={cn(
            "my-auto block h-auto max-w-full transition-opacity",
            isPruned && "opacity-40 grayscale",
          )}
          onError={() => setFailed(true)}
          onLoad={
            width && height
              ? undefined
              : (e) => {
                  const img = e.currentTarget
                  setLoadedDims({ w: img.naturalWidth, h: img.naturalHeight })
                }
          }
        />
      )}

      <div className="mt-auto w-full border-t bg-muted/30 px-2 py-1">
        <div className="flex items-center justify-between">
          <span className="truncate font-mono text-[10px] text-muted-foreground">{imageId}</span>
          {dims && (
            <span className="ml-1 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {dims.w}&times;{dims.h}
            </span>
          )}
        </div>
        {isPruned && reason && (
          <p className="mt-0.5 truncate text-[10px] text-destructive/70" title={reason}>
            {reason}
          </p>
        )}
      </div>
    </div>
  )
})
