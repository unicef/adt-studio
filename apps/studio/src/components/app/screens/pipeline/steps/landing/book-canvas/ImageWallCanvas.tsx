import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { plural } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { ImageOff } from "lucide-react"
import { getImageThumbnailUrl, type PageDetail } from "@/api/client"
import { pageQueryOptions, usePages } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { buildImageSectionMap } from "../../captions/sectionGroups"

const THUMB_WIDTH = 200
const TILE = "relative overflow-hidden rounded-lg bg-card shadow-[0_8px_24px_-14px_rgba(15,23,42,0.4)] ring-1 ring-black/5"

interface WallImage {
  imageId: string
  pageNumber: number
}

function imagesOf(page: PageDetail): string[] {
  const placed = [...buildImageSectionMap(page).keys()]
  if (placed.length > 0) return placed
  return (page.imageClassification?.images ?? []).filter((image) => !image.isPruned && !image.imageId.endsWith("_page")).map((image) => image.imageId)
}

function WallTile({ label, image, number }: { label: string; image: WallImage; number: number }) {
  const { t } = useLingui()
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading")
  return (
    <figure className={cn(TILE, "grid aspect-square place-items-center bg-card p-2")}>
      {state !== "loaded" && state !== "failed" && <div className="absolute inset-0 bg-muted motion-safe:animate-pulse" />}
      {state === "failed" ? (
        <ImageOff className="size-5 text-muted-foreground/60" strokeWidth={1.8} />
      ) : (
        <img
          src={getImageThumbnailUrl(label, image.imageId, THUMB_WIDTH)}
          srcSet={`${getImageThumbnailUrl(label, image.imageId, THUMB_WIDTH)} 1x, ${getImageThumbnailUrl(label, image.imageId, THUMB_WIDTH * 2)} 2x`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={cn("relative max-h-full max-w-full object-contain transition-opacity duration-300 motion-reduce:transition-none", state === "loaded" ? "opacity-100" : "opacity-0")}
        />
      )}
      <figcaption
        title={t`Image ${number}, page ${image.pageNumber}`}
        className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-white backdrop-blur-sm"
      >
        {t`p. ${image.pageNumber}`}
      </figcaption>
    </figure>
  )
}

export function ImageWallCanvas({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const pagesQuery = usePages(bookLabel)
  const withImages = useMemo(() => (pagesQuery.data ?? []).filter((page) => page.imageCount > 0), [pagesQuery.data])
  const details = useQueries({ queries: withImages.map((page) => ({ ...pageQueryOptions(bookLabel, page.pageId), staleTime: 60_000 })) })
  const images = useMemo<WallImage[]>(
    () =>
      details.flatMap((result) => (result.data ? imagesOf(result.data).map((imageId) => ({ imageId, pageNumber: result.data.pageNumber })) : [])),
    [details],
  )
  const loading = pagesQuery.isPending || details.some((result) => result.isPending)
  const empty = !loading && images.length === 0
  const pageCount = new Set(images.map((image) => image.pageNumber)).size

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-muted/40">
      <div className="absolute inset-y-0 right-0 left-[min(480px,42%)]">
        <div className="size-full overflow-y-auto overscroll-contain px-8 pt-8 pb-40 [scrollbar-width:thin]!">
          {empty && (
            <div className="grid h-full min-h-[360px] place-items-center animate-in fade-in duration-300 motion-reduce:animate-none">
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-card text-muted-foreground shadow-sm ring-1 ring-black/5">
                  <ImageOff className="size-5" strokeWidth={1.8} />
                </span>
                <p className="text-[14px] font-semibold text-foreground">{t`No images to describe in this book`}</p>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t`Extract didn't keep any pictures, so there is nothing for Image descriptions to write. If the book does have pictures, check Extract's image filters and run it again.`}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 animate-in fade-in duration-300 motion-reduce:animate-none">
            {images.map((image, index) => (
              <div
                key={image.imageId}
                className="animate-in fade-in zoom-in-95 fill-mode-both duration-500 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
              >
                <WallTile label={bookLabel} image={image} number={index + 1} />
              </div>
            ))}
            {loading &&
              Array.from({ length: Math.max(0, 12 - images.length) }, (_, index) => (
                <div key={`placeholder-${index}`} className={cn(TILE, "aspect-square bg-muted motion-safe:animate-pulse")} />
              ))}
          </div>
        </div>
      </div>
      {!empty && <p className="pointer-events-none absolute right-8 bottom-24 flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
        {images.length > 0 && (
          <span className="font-semibold text-foreground tabular-nums">
            {t`${plural(images.length, { one: "# image", other: "# images" })} on ${plural(pageCount, { one: "# page", other: "# pages" })}`}
          </span>
        )}
        <span>{t`Each one gets a short description for screen readers.`}</span>
      </p>}
    </div>
  )
}
