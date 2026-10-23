import { useState } from "react"
import { ImageOff, Maximize2, RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { usePageImage } from "@/hooks/use-pages"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"

export function PageDetailImage({ label, pageId, pageNumber }: { label: string; pageId: string; pageNumber: number }) {
  const { t } = useLingui()
  const { data, isError, refetch } = usePageImage(label, pageId)
  const [open, setOpen] = useState(false)
  return (
    <>
      {data ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t`Enlarge page ${pageNumber}`}
          className="group relative block w-full overflow-hidden rounded-lg border bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={`data:image/png;base64,${data.imageBase64}`}
            alt={t`Page ${pageNumber}`}
            className="block h-auto w-full animate-in fade-in duration-300 motion-reduce:animate-none"
          />
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-background/85 text-foreground opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </button>
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border bg-muted/50 text-[12.5px] text-muted-foreground">
          <div role={isError ? "alert" : "status"} className="flex flex-col items-center gap-2">
            <ImageOff className="size-6" />
            {isError ? <Trans>Couldn't load the page image</Trans> : <Trans>Loading image…</Trans>}
            {isError && (
              <button
                type="button"
                onClick={() => void refetch()}
                className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RotateCcw className="size-3" />
                <Trans>Try again</Trans>
              </button>
            )}
          </div>
        </div>
      )}
      <PageLightbox bookLabel={label} pageId={pageId} open={open} onOpenChange={setOpen} />
    </>
  )
}
