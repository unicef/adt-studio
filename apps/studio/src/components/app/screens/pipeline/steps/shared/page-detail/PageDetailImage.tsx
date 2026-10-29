import { useState } from "react"
import { ImageOff, Maximize2, RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"
import { lowResThumbnail, pageViewThumbnailUrl } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"

function withRetry(url: string, attempt: number): string {
  if (attempt === 0) return url
  const next = new URL(url, window.location.href)
  next.searchParams.set("retry", String(attempt))
  return next.toString()
}

export function PageDetailImage({ label, pageId, pageNumber }: { label: string; pageId: string; pageNumber: number }) {
  const { t } = useLingui()
  const [attempt, setAttempt] = useState(0)
  const src = withRetry(pageViewThumbnailUrl(label, pageId), attempt)
  const lowSrc = lowResThumbnail(label, pageId)
  const [state, setState] = useState<{ src: string; status: "loading" | "loaded" | "failed" }>({ src, status: "loading" })
  const status = state.src === src ? state.status : "loading"
  const [open, setOpen] = useState(false)
  return (
    <>
      {status === "failed" ? (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border bg-muted/50 text-[12.5px] text-muted-foreground">
          <div role="alert" className="flex flex-col items-center gap-2">
            <ImageOff className="size-6" />
            <Trans>Couldn't load the page image</Trans>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <RotateCcw className="size-3" />
              <Trans>Try again</Trans>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t`Enlarge page ${pageNumber}`}
          className={cn(
            "group relative block w-full overflow-hidden rounded-lg border bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            status !== "loaded" && "min-h-40",
          )}
        >
          {status !== "loaded" && <img aria-hidden alt="" src={lowSrc} className="absolute inset-0 size-full object-contain" />}
          <img
            src={src}
            alt={t`Page ${pageNumber}`}
            decoding="async"
            onLoad={() => setState({ src, status: "loaded" })}
            onError={() => setState({ src, status: "failed" })}
            className={cn(
              "relative block h-auto w-full transition-opacity duration-300 ease-out motion-reduce:transition-none",
              status === "loaded" ? "opacity-100" : "opacity-0",
            )}
          />
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-background/85 text-foreground opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </button>
      )}
      <PageLightbox bookLabel={label} pageId={pageId} open={open} onOpenChange={setOpen} />
    </>
  )
}
