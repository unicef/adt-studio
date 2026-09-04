import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Link2,
  Loader2,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { CarouselSlide } from "@/components/ui/info-carousel"
import { DEMO_PDF_URL } from "@/components/wizard/constants"
import { getCachedPdfPageCount } from "@/components/wizard/shared/pdfMetadata"
import { usePdfPreviewPages } from "@/components/wizard/shared/usePdfPreviewPages"
import { cn } from "@/lib/utils"

export type { CarouselSlide }

type PreviewMode = "single" | "spread" | "merge-later"

interface PageGroupingHelpTriggerProps {
  label: string
}

export function PageGroupingHelpTrigger({ label }: PageGroupingHelpTriggerProps) {
  return (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        aria-label={label}
        aria-controls="page-grouping-help"
      >
        <CircleHelp className="size-[14px]" />
      </Button>
    </PopoverTrigger>
  )
}

function PdfPageImage({
  src,
  pageNumber,
  className,
}: {
  src: string
  pageNumber: number
  className?: string
}) {
  const { t } = useLingui()

  return (
    <img
      src={src}
      alt={t`PDF page ${pageNumber} preview`}
      decoding="async"
      className={cn(
        "block h-auto rounded-sm border border-neutral-300 bg-white object-contain shadow-sm",
        className,
      )}
    />
  )
}

function SinglePreview({ pages, startIndex }: { pages: string[]; startIndex: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      {pages.slice(0, 2).map((src, index) => (
        <PdfPageImage
          key={`${startIndex}-${index}`}
          src={src}
          pageNumber={startIndex + index + 1}
          className="max-h-[76px] max-w-[190px]"
        />
      ))}
    </div>
  )
}

function JoinedPages({
  pages,
  startIndex,
  compact = false,
  showGutterLabel = false,
}: {
  pages: string[]
  startIndex: number
  compact?: boolean
  showGutterLabel?: boolean
}) {
  return (
    <div className="relative flex max-w-full items-stretch overflow-visible rounded-sm border border-neutral-300 bg-white shadow-sm">
      {pages.slice(0, 2).map((src, index) => (
        <PdfPageImage
          key={`${startIndex}-${index}`}
          src={src}
          pageNumber={startIndex + index + 1}
          className={cn(
            "rounded-none border-0 shadow-none",
            compact ? "max-h-[72px] max-w-[138px]" : "max-h-[126px] max-w-[166px]",
          )}
        />
      ))}
      {pages.length > 1 && (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 left-1/2 w-0.75 -translate-x-1/2 bg-amber-500"
            aria-hidden
          />
          {showGutterLabel && (
            <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              <Trans>the gutter</Trans>
            </span>
          )}
        </>
      )}
    </div>
  )
}

function MergeLaterPreview({ pages, startIndex }: { pages: string[]; startIndex: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      {pages[0] && (
        <PdfPageImage
          src={pages[0]}
          pageNumber={startIndex + 1}
          className="max-h-[58px] max-w-[150px]"
        />
      )}
      <div className="relative">
        <JoinedPages pages={pages.slice(1, 3)} startIndex={startIndex + 1} compact />
        {pages.length > 2 && (
          <span className="absolute left-1/2 top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-white">
            <Link2 className="size-3" aria-hidden />
          </span>
        )}
      </div>
    </div>
  )
}

function PreviewViewport({
  mode,
  pages,
  startIndex,
  loading,
  error,
  usingFallback,
}: {
  mode: PreviewMode
  pages: string[]
  startIndex: number
  loading: boolean
  error: string | null
  usingFallback: boolean
}) {
  return (
    <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-neutral-50 p-4">
      {usingFallback && !error && pages.length > 0 && (
        <span className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
          <Trans>Sample PDF</Trans>
        </span>
      )}
      {error ? (
        <p className="text-center text-xs text-muted-foreground">
          <Trans>Unable to render the PDF preview.</Trans>
        </p>
      ) : loading || pages.length === 0 ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      ) : mode === "single" ? (
        <SinglePreview pages={pages} startIndex={startIndex} />
      ) : mode === "spread" ? (
        <JoinedPages pages={pages} startIndex={startIndex} showGutterLabel />
      ) : (
        <MergeLaterPreview pages={pages} startIndex={startIndex} />
      )}
    </div>
  )
}

interface PageGroupingHelpPanelProps {
  label: string
  slides: readonly CarouselSlide[]
  file?: File | null
  open: boolean
}

export function PageGroupingHelpPanel({
  label,
  slides,
  file,
  open,
}: PageGroupingHelpPanelProps) {
  const { t } = useLingui()
  const [mode, setMode] = useState<PreviewMode>("single")
  const [pageStart, setPageStart] = useState(1)
  const primaryPreview = usePdfPreviewPages({
    file: open ? file : null,
    mode: "all",
    width: 220,
  })
  const usingFallback = !file || primaryPreview.error !== null
  const fallbackPreview = usePdfPreviewPages({
    src: open && usingFallback ? DEMO_PDF_URL : undefined,
    mode: "all",
    width: 220,
  })
  const activePreview = usingFallback ? fallbackPreview : primaryPreview

  const previewPages = activePreview.pages.slice(0, 10)
  const cachedPageCount = !usingFallback && file ? getCachedPdfPageCount(file) : undefined
  const navigationLimit = Math.min(10, cachedPageCount ?? previewPages.length)
  const firstStart = navigationLimit > 2 ? 1 : 0
  const groupSize = mode === "merge-later" ? 3 : 2
  const safeStart = Math.min(pageStart, Math.max(0, navigationLimit - 1))
  const visibleEnd = Math.min(navigationLimit, safeStart + groupSize)
  const visiblePages = previewPages.slice(safeStart, visibleEnd)
  const waitingForVisiblePages = visiblePages.length < visibleEnd - safeStart
  const hasPrevious = safeStart > firstStart
  const hasNext = safeStart + groupSize < navigationLimit
  const displayStart = safeStart + 1
  const displayEnd = Math.max(displayStart, visibleEnd)

  useEffect(() => {
    setPageStart(1)
  }, [file])

  const changeMode = (nextMode: string) => {
    setMode(nextMode as PreviewMode)
    setPageStart(firstStart)
  }

  const description =
    mode === "single" ? slides[0]?.description : mode === "spread" ? slides[1]?.description : slides[2]?.description

  return (
    <PopoverContent
      id="page-grouping-help"
      aria-label={label}
      side="top"
      align="center"
      avoidCollisions
      collisionPadding={12}
      onOpenAutoFocus={(event) => event.preventDefault()}
      className="max-h-[var(--radix-popover-content-available-height)] w-[420px] max-w-[calc(100vw-1rem)] overflow-y-auto p-4 font-sans"
    >
      <Tabs value={mode} onValueChange={changeMode} className="w-full">
        <TabsList className="grid h-10 w-full grid-cols-3 bg-neutral-50">
          <TabsTrigger value="single" className="h-full min-w-0 px-2 text-xs font-semibold">
            <Trans>Single</Trans>
          </TabsTrigger>
          <TabsTrigger value="spread" className="h-full min-w-0 px-2 text-xs font-semibold">
            <Trans>Spread</Trans>
          </TabsTrigger>
          <TabsTrigger value="merge-later" className="h-full min-w-0 px-2 text-xs font-semibold">
            <Trans>Single + merge later</Trans>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={mode} className="mt-3 flex flex-col gap-3">
          <p className="min-h-9 text-xs font-normal leading-relaxed text-muted-foreground">
            {description}
          </p>
          <PreviewViewport
            mode={mode}
            pages={visiblePages}
            startIndex={safeStart}
            loading={activePreview.isLoading || waitingForVisiblePages}
            error={activePreview.error}
            usingFallback={usingFallback}
          />
        </TabsContent>
      </Tabs>

      <div className="flex w-full items-center justify-center pt-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-md border-2"
          disabled={!hasPrevious}
          onClick={() => setPageStart((current) => Math.max(firstStart, current - groupSize))}
          aria-label={t`Previous pages`}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <span className="min-w-32 text-center text-xs font-medium text-muted-foreground">
          {t`Your pages ${displayStart}–${displayEnd}`}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 rounded-md border-2"
          disabled={!hasNext}
          onClick={() =>
            setPageStart((current) => Math.min(navigationLimit - 1, current + groupSize))
          }
          aria-label={t`Next pages`}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </PopoverContent>
  )
}
